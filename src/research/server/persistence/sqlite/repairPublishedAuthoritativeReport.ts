import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  type AuthoritativeReportCommit,
  persistAuthoritativeReport,
} from "../../../application/assembleReportPersistence";
import type { AcceptedChairFence } from "../../../application/authoritativeReportPublisherContracts";
import {
  canonicalJson,
  hashBytes,
  hashCanonical,
} from "../../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { WorkflowV2ResearchReportSchema } from "../../../domain/report";
import {
  parseStoredResearchReportVersioned,
  singleLocaleReportForStorage,
} from "../../../domain/reportStorage";
import {
  type ArtifactCasPort,
  ArtifactDigestSchema,
} from "../../../ports/artifacts";
import {
  evaluatePrePublicationEditorialGate,
  type PrePublicationEditorialEnvelope,
} from "../../../workflow/prePublicationEditorialGate";
import { loadReportAuthority } from "./authoritativeReportAuthority";
import { parseSafeJson, serializeSafeJson } from "./safeJson";

const SourceRowSchema = z.object({
  run_status: z.enum(["completed", "complete-with-limitations"]),
  run_report_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  version_id: z.string().uuid(),
  version: z.literal(1),
  artifact_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
  published_at: z.string().datetime(),
  public_payload_json: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
});

const SavedEnvelopeSchema = z
  .object({
    gateVersion: z.literal("editorial-quality-v1"),
    qaPolicy: z
      .object({
        moduleMinimum: z.literal(5),
        standardTarget: z.literal(10),
        supportedCount: z.number().int().nonnegative(),
        moduleVisible: z.boolean(),
      })
      .passthrough(),
    candidate: z.unknown(),
    fieldLineage: z
      .record(z.string(), z.enum(["synthesis", "targeted_rewrite"]))
      .optional(),
  })
  .passthrough();

export type PublishedReportRepairAuthorization = Readonly<{
  runId: string;
  reportId: string;
  sourceVersionId: string;
  sourceArtifactId: string;
  sourceDigest: string;
  acceptedChairArtifactId: string;
  fence: AcceptedChairFence;
  projectionHash: string;
  persistenceHash: string;
}>;

export type PublishedDepartmentReportRepairAuthorization = Readonly<{
  runId: string;
  reportId: string;
  sourceVersionId: string;
  sourceArtifactId: string;
  sourceDigest: string;
  departmentId: "market" | "company" | "financial" | "risk";
  sourceGateHash: string;
  persistenceHash: string;
}>;

type VersionRepairAuthorization = Readonly<{
  runId: string;
  reportId: string;
  sourceVersionId: string;
  sourceArtifactId: string;
  sourceDigest: string;
  projectionHash: string;
  persistenceHash: string;
}>;

export type PublishedReportRepairResult = Readonly<
  | {
      kind: "published" | "replayed";
      reportId: string;
      versionId: string;
      artifactId: string;
      digest: string;
    }
  | { kind: "rejected"; reason: string }
>;

function deterministicUuid(seed: string, label: string): string {
  const hex = createHash("sha256").update(`${seed}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sourceRow(
  database: Database.Database,
  authorization: VersionRepairAuthorization,
) {
  return SourceRowSchema.safeParse(
    database
      .prepare(`SELECT runs.status AS run_status,
    runs.report_id AS run_report_id, runs.snapshot_id,
    report_versions.version_id, report_versions.version,
    report_versions.artifact_id, artifacts.content_hash,
    report_versions.published_at, report_versions.public_payload_json,
    research_requests.locale, research_requests.research_kind,
    research_requests.department_id
    FROM runs JOIN reports ON reports.report_id = runs.report_id
    JOIN research_requests ON research_requests.run_id = runs.run_id
    JOIN report_versions ON report_versions.report_id = reports.report_id
    JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
    WHERE runs.run_id = ? AND reports.report_id = ? AND report_versions.version = 1`)
      .get(authorization.runId, authorization.reportId),
  );
}

function publishRepairAtomically(
  databasePath: string,
  authorizationHash: string,
  authorization: VersionRepairAuthorization,
  commit: AuthoritativeReportCommit,
): { kind: "published" | "replayed"; version: number } {
  const database = new Database(databasePath, { timeout: 5_000 });
  database.pragma("foreign_keys = ON");
  try {
    return database
      .transaction(() => {
        const existing = database
          .prepare(`SELECT report_versions.version,
        report_versions.artifact_id, artifacts.content_hash,
        report_versions.public_payload_json FROM report_versions
        JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
        WHERE report_versions.report_id = ? AND report_versions.version = 2`)
          .get(authorization.reportId) as
          | {
              version: number;
              artifact_id: string;
              content_hash: string;
              public_payload_json: string;
            }
          | undefined;
        if (existing !== undefined) {
          const payload = parseSafeJson(existing.public_payload_json) as Record<
            string,
            unknown
          >;
          const repair = payload["repairMetadata"] as
            | Record<string, unknown>
            | undefined;
          if (repair?.["authorizationHash"] !== authorizationHash)
            throw new TypeError("report_repair_conflict");
          return { kind: "replayed" as const, version: existing.version };
        }
        const source = sourceRow(database, authorization);
        if (
          !source.success ||
          source.data.run_report_id !== authorization.reportId ||
          source.data.version_id !== authorization.sourceVersionId ||
          source.data.artifact_id !== authorization.sourceArtifactId ||
          source.data.content_hash !== authorization.sourceDigest ||
          commit.version.reportId !== authorization.reportId ||
          commit.version.runId !== authorization.runId ||
          commit.version.snapshotId !== source.data.snapshot_id ||
          commit.version.expectedVersion !== 2 ||
          commit.version.priorVersionId !== authorization.sourceVersionId ||
          commit.descriptor.digest === authorization.sourceDigest
        )
          throw new TypeError("report_repair_authorization_mismatch");
        const payload = commit.version.publicPayload as Record<string, unknown>;
        const repair = payload["repairMetadata"] as
          | Record<string, unknown>
          | undefined;
        if (
          repair?.["authorizationHash"] !== authorizationHash ||
          repair["supersedesVersion"] !== 1 ||
          repair["projectionHash"] !== authorization.projectionHash ||
          repair["persistenceHash"] !== authorization.persistenceHash
        )
          throw new TypeError("report_repair_metadata_mismatch");
        database
          .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            commit.descriptor.artifactId,
            authorization.runId,
            source.data.snapshot_id,
            commit.descriptor.digest,
            commit.descriptor.byteLength,
            commit.descriptor.mediaType,
            `report_version:${commit.version.versionId}`,
            commit.descriptor.digest,
            commit.version.publishedAt,
          );
        const edge = database.prepare(`INSERT INTO artifact_edges(
        child_artifact_id, parent_artifact_id, relation) VALUES (?, ?, 'derived-from')`);
        for (const parentId of commit.parentArtifactIds)
          edge.run(commit.descriptor.artifactId, parentId);
        database
          .prepare(`INSERT INTO report_versions(version_id, report_id, run_id,
        snapshot_id, version, artifact_id, status, published_at, public_payload_json)
        VALUES (?, ?, ?, ?, 2, ?, ?, ?, ?)`)
          .run(
            commit.version.versionId,
            authorization.reportId,
            authorization.runId,
            source.data.snapshot_id,
            commit.descriptor.artifactId,
            commit.version.status,
            commit.version.publishedAt,
            serializeSafeJson(commit.version.publicPayload),
          );
        return { kind: "published" as const, version: 2 };
      })
      .immediate();
  } finally {
    database.close();
  }
}

export async function repairPublishedAuthoritativeReport(
  options: Readonly<{ databasePath: string; cas: ArtifactCasPort }>,
  authorization: PublishedReportRepairAuthorization,
): Promise<PublishedReportRepairResult> {
  const authorizationHash = hashCanonical(authorization);
  const database = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  let source: z.infer<typeof SourceRowSchema>;
  try {
    const parsed = sourceRow(database, authorization);
    if (!parsed.success)
      return { kind: "rejected", reason: "source_version_missing" };
    source = parsed.data;
    const existing = database
      .prepare(`SELECT public_payload_json FROM report_versions
      WHERE report_id = ? AND version = 2`)
      .get(authorization.reportId) as
      | { public_payload_json: string }
      | undefined;
    if (existing !== undefined) {
      const payload = parseSafeJson(existing.public_payload_json) as Record<
        string,
        unknown
      >;
      const repair = payload["repairMetadata"] as
        | Record<string, unknown>
        | undefined;
      return repair?.["authorizationHash"] === authorizationHash
        ? (() => {
            const row = database
              .prepare(`SELECT report_versions.version_id,
              report_versions.artifact_id, artifacts.content_hash FROM report_versions
              JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
              WHERE report_versions.report_id = ? AND report_versions.version = 2`)
              .get(authorization.reportId) as {
              version_id: string;
              artifact_id: string;
              content_hash: string;
            };
            return {
              kind: "replayed" as const,
              reportId: authorization.reportId,
              versionId: row.version_id,
              artifactId: row.artifact_id,
              digest: row.content_hash,
            };
          })()
        : { kind: "rejected", reason: "report_repair_conflict" };
    }
  } finally {
    database.close();
  }
  if (
    source.run_report_id !== authorization.reportId ||
    source.version_id !== authorization.sourceVersionId ||
    source.artifact_id !== authorization.sourceArtifactId ||
    source.content_hash !== authorization.sourceDigest
  )
    return { kind: "rejected", reason: "source_authorization_mismatch" };
  const sourceArtifact = await options.cas.get(source.content_hash);
  if (
    sourceArtifact === undefined ||
    sourceArtifact.descriptor.artifactId !== source.artifact_id
  )
    return {
      kind: "rejected",
      reason: "source_artifact_authentication_failed",
    };
  const priorReport = parseStoredResearchReportVersioned(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(sourceArtifact.bytes),
    ),
  );
  if (priorReport.schemaVersion === "workflow-v3")
    return { kind: "rejected", reason: "report_repair_version_unsupported" };
  const payload = parseSafeJson(source.public_payload_json) as Record<
    string,
    unknown
  >;
  const envelopeShape = SavedEnvelopeSchema.safeParse(
    payload["editorialPublication"],
  );
  if (!envelopeShape.success)
    return { kind: "rejected", reason: "saved_editorial_authority_invalid" };
  const savedEnvelope =
    envelopeShape.data as unknown as PrePublicationEditorialEnvelope;
  const versionId = deterministicUuid(authorizationHash, "version");
  const artifactId = deterministicUuid(authorizationHash, "artifact");
  const authority = await loadReportAuthority(
    options.databasePath,
    options.cas,
    {
      runId: authorization.runId,
      acceptedChairArtifactId: authorization.acceptedChairArtifactId,
      fence: authorization.fence,
    },
    {
      reportId: authorization.reportId,
      reportArtifactId: artifactId,
      versionId,
      version: 2,
      priorReport,
      expectedStatus: source.run_status,
    },
  );
  if (authority === undefined)
    return { kind: "rejected", reason: "authority_authentication_failed" };
  const publishedAt = new Date(
    Date.parse(source.published_at) + 1,
  ).toISOString();
  let persistenceKind: "published" | "replayed" = "published";
  const result = await persistAuthoritativeReport(
    {
      cas: options.cas,
      now: () => publishedAt,
      savedEditorialPublication: savedEnvelope,
      repairMetadata: {
        authorizationHash,
        supersedesVersion: 1,
        projectionHash: authorization.projectionHash,
        persistenceHash: authorization.persistenceHash,
      },
      persistence: {
        save: (commit) => {
          const persisted = publishRepairAtomically(
            options.databasePath,
            authorizationHash,
            authorization,
            commit,
          );
          persistenceKind = persisted.kind;
          return persisted.version;
        },
      },
    },
    authority,
  );
  if (result.kind === "blocked")
    return { kind: "rejected", reason: result.reason };
  return {
    kind: persistenceKind,
    reportId: authorization.reportId,
    versionId,
    artifactId,
    digest: result.descriptor.digest,
  };
}

export async function repairPublishedDepartmentReport(
  options: Readonly<{ databasePath: string; cas: ArtifactCasPort }>,
  authorization: PublishedDepartmentReportRepairAuthorization,
): Promise<PublishedReportRepairResult> {
  const database = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  let source: z.infer<typeof SourceRowSchema>;
  let parentArtifactIds: string[];
  try {
    const baseSource = sourceRow(database, {
      ...authorization,
      projectionHash: "pending",
    });
    if (!baseSource.success)
      return { kind: "rejected", reason: "source_version_missing" };
    source = baseSource.data;
    if (
      source.research_kind !== "department" ||
      source.department_id !== authorization.departmentId
    )
      return { kind: "rejected", reason: "department_authorization_mismatch" };
    parentArtifactIds = database
      .prepare(`SELECT parent_artifact_id FROM artifact_edges
      WHERE child_artifact_id = ? ORDER BY parent_artifact_id`)
      .all(source.artifact_id)
      .map((row) => (row as { parent_artifact_id: string }).parent_artifact_id);
  } finally {
    database.close();
  }
  if (
    source.run_report_id !== authorization.reportId ||
    source.version_id !== authorization.sourceVersionId ||
    source.artifact_id !== authorization.sourceArtifactId ||
    source.content_hash !== authorization.sourceDigest
  )
    return { kind: "rejected", reason: "source_authorization_mismatch" };
  const sourceArtifact = await options.cas.get(source.content_hash);
  if (
    sourceArtifact === undefined ||
    sourceArtifact.descriptor.artifactId !== source.artifact_id
  )
    return {
      kind: "rejected",
      reason: "source_artifact_authentication_failed",
    };
  const priorReport = parseStoredResearchReportVersioned(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(sourceArtifact.bytes),
    ),
  );
  if (
    priorReport.schemaVersion !== "workflow-v2" ||
    priorReport.researchTarget.kind !== "department" ||
    priorReport.researchTarget.departmentId !== authorization.departmentId
  )
    return { kind: "rejected", reason: "department_report_authority_mismatch" };
  const payload = parseSafeJson(source.public_payload_json) as Record<
    string,
    unknown
  >;
  const envelopeShape = SavedEnvelopeSchema.safeParse(
    payload["editorialPublication"],
  );
  if (!envelopeShape.success)
    return { kind: "rejected", reason: "saved_editorial_authority_invalid" };
  const savedEnvelope =
    envelopeShape.data as unknown as PrePublicationEditorialEnvelope;
  if (
    hashCanonical(savedEnvelope) !== authorization.sourceGateHash ||
    !evaluatePrePublicationEditorialGate(savedEnvelope.candidate).publishable
  )
    return { kind: "rejected", reason: "saved_editorial_authority_mismatch" };
  const projectionHash = hashCanonical(savedEnvelope.candidate);
  const versionAuthorization: VersionRepairAuthorization = {
    ...authorization,
    projectionHash,
  };
  const authorizationHash = hashCanonical(versionAuthorization);
  const replayDatabase = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const existing = replayDatabase
      .prepare(`SELECT report_versions.version_id,
      report_versions.artifact_id, artifacts.content_hash, report_versions.public_payload_json
      FROM report_versions JOIN artifacts USING(artifact_id)
      WHERE report_versions.report_id = ? AND report_versions.version = 2`)
      .get(authorization.reportId) as
      | {
          version_id: string;
          artifact_id: string;
          content_hash: string;
          public_payload_json: string;
        }
      | undefined;
    if (existing !== undefined) {
      const existingPayload = parseSafeJson(
        existing.public_payload_json,
      ) as Record<string, unknown>;
      const repair = existingPayload["repairMetadata"] as
        | Record<string, unknown>
        | undefined;
      return repair?.["authorizationHash"] === authorizationHash
        ? {
            kind: "replayed",
            reportId: authorization.reportId,
            versionId: existing.version_id,
            artifactId: existing.artifact_id,
            digest: existing.content_hash,
          }
        : { kind: "rejected", reason: "report_repair_conflict" };
    }
  } finally {
    replayDatabase.close();
  }
  const versionId = ReportVersionIdSchema.parse(
    deterministicUuid(authorizationHash, "version"),
  );
  const artifactId = ArtifactIdSchema.parse(
    deterministicUuid(authorizationHash, "artifact"),
  );
  const sections = new Map(
    savedEnvelope.candidate.sections.map((section) => [
      section.sectionKey,
      section,
    ]),
  );
  const localizedSections = (locale: "en" | "ko") =>
    priorReport.locales[locale].sections
      .filter((section) => sections.has(section.id))
      .map((section) => {
        const gated = sections.get(section.id)!;
        return {
          ...section,
          body: gated.text[locale],
          claimIds: gated.claimIds,
        };
      });
  const report = WorkflowV2ResearchReportSchema.parse({
    ...priorReport,
    versionId,
    version: 2,
    versionDelta: {
      priorVersionId: authorization.sourceVersionId,
      addedClaimIds: [],
      removedClaimIds: [],
    },
    teamViews: priorReport.teamViews.map((view, index) =>
      index === 0
        ? {
            ...view,
            position: savedEnvelope.candidate.position,
            rationale: savedEnvelope.candidate.rationale,
          }
        : view,
    ),
    locales: {
      en: { ...priorReport.locales.en, sections: localizedSections("en") },
      ko: { ...priorReport.locales.ko, sections: localizedSections("ko") },
    },
    anticipatedQuestions: savedEnvelope.candidate.anticipatedQuestions,
  });
  const publishedAt = new Date(
    Date.parse(source.published_at) + 1,
  ).toISOString();
  const bytes = new TextEncoder().encode(
    canonicalJson(singleLocaleReportForStorage(report, source.locale)),
  );
  const descriptor = await options.cas.put({
    artifactId,
    runId: RunIdSchema.parse(authorization.runId),
    snapshotId: SnapshotIdSchema.parse(source.snapshot_id),
    mediaType: "application/vnd.stocksembly.research-report+json",
    parentDigests: sourceArtifact.descriptor.parentDigests,
    bytes,
  });
  let persistenceKind: "published" | "replayed" = "published";
  const publicPayload = {
    ...payload,
    reportArtifactDigest: descriptor.digest,
    version: 2,
    priorVersionId: authorization.sourceVersionId,
    anticipatedQuestions: report.anticipatedQuestions,
    editorialPublication: savedEnvelope,
    repairMetadata: {
      authorizationHash,
      supersedesVersion: 1,
      projectionHash,
      persistenceHash: authorization.persistenceHash,
    },
  } as unknown as AuthoritativeReportCommit["version"]["publicPayload"];
  const persisted = publishRepairAtomically(
    options.databasePath,
    authorizationHash,
    versionAuthorization,
    {
      report,
      descriptor,
      parentArtifactIds,
      version: {
        reportId: report.reportId,
        versionId,
        runId: report.runId,
        snapshotId: report.snapshotId,
        artifactId,
        status: report.status,
        publishedAt,
        publicPayload,
        expectedVersion: 2,
        priorVersionId: ReportVersionIdSchema.parse(
          authorization.sourceVersionId,
        ),
      },
    },
  );
  persistenceKind = persisted.kind;
  return {
    kind: persistenceKind,
    reportId: authorization.reportId,
    versionId,
    artifactId,
    digest: descriptor.digest,
  };
}

export const REPORT_REPAIR_PERSISTENCE_HASH = hashCanonical({
  implementation:
    "assemble-report-persistence:gated-position-rationale-sections:v2",
  serialization: canonicalJson({ version: 2, priorVersion: 1 }),
});

export type ExactPublishedTextPatch = Readonly<{
  path: readonly (string | number)[];
  expected: string;
  replacement: string;
}>;

export type PublishedExactTextRepairAuthorization = Readonly<{
  runId: string;
  reportId: string;
  sourceVersion: number;
  sourceVersionId: string;
  sourceArtifactId: string;
  sourceDigest: string;
  reportPatches: readonly ExactPublishedTextPatch[];
  publicationPatches: readonly ExactPublishedTextPatch[];
  persistenceHash: string;
}>;

function applyExactTextPatches(
  value: unknown,
  patches: readonly ExactPublishedTextPatch[],
): unknown {
  const copy: unknown = structuredClone(value);
  for (const patch of patches) {
    if (patch.path.length === 0 || patch.expected === patch.replacement)
      throw new TypeError("report_text_repair_patch_invalid");
    let parent: unknown = copy;
    for (const segment of patch.path.slice(0, -1)) {
      if (typeof segment === "number") {
        if (!Array.isArray(parent) || parent[segment] === undefined)
          throw new TypeError("report_text_repair_path_missing");
        parent = parent[segment];
      } else {
        if (
          typeof parent !== "object" ||
          parent === null ||
          !(segment in parent)
        )
          throw new TypeError("report_text_repair_path_missing");
        parent = Reflect.get(parent, segment);
      }
    }
    const leaf = patch.path.at(-1)!;
    const current =
      typeof leaf === "number"
        ? Array.isArray(parent)
          ? parent[leaf]
          : undefined
        : typeof parent === "object" && parent !== null
          ? Reflect.get(parent, leaf)
          : undefined;
    if (current !== patch.expected)
      throw new TypeError("report_text_repair_expected_text_mismatch");
    if (typeof leaf === "number") {
      if (!Array.isArray(parent))
        throw new TypeError("report_text_repair_path_missing");
      parent[leaf] = patch.replacement;
    } else {
      if (typeof parent !== "object" || parent === null)
        throw new TypeError("report_text_repair_path_missing");
      Reflect.set(parent, leaf, patch.replacement);
    }
  }
  return copy;
}

export async function repairPublishedReportExactText(
  options: Readonly<{ databasePath: string; cas: ArtifactCasPort }>,
  authorization: PublishedExactTextRepairAuthorization,
): Promise<PublishedReportRepairResult> {
  if (authorization.persistenceHash !== EXACT_TEXT_REPAIR_PERSISTENCE_HASH)
    return { kind: "rejected", reason: "persistence_hash_mismatch" };
  if (
    !Number.isSafeInteger(authorization.sourceVersion) ||
    authorization.sourceVersion < 1
  )
    return { kind: "rejected", reason: "source_version_invalid" };
  const targetVersion = authorization.sourceVersion + 1;
  const authorizationHash = hashCanonical(authorization);
  const database = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  let source:
    | {
        version_id: string;
        artifact_id: string;
        content_hash: string;
        snapshot_id: string;
        published_at: string;
        public_payload_json: string;
        run_report_id: string;
        locale: "en" | "ko";
      }
    | undefined;
  try {
    const existing = database
      .prepare(`SELECT report_versions.version_id,
      report_versions.artifact_id, artifacts.content_hash, report_versions.public_payload_json
      FROM report_versions JOIN artifacts USING(artifact_id)
      WHERE report_versions.report_id = ? AND report_versions.version = ?`)
      .get(authorization.reportId, targetVersion) as
      | {
          version_id: string;
          artifact_id: string;
          content_hash: string;
          public_payload_json: string;
        }
      | undefined;
    if (existing !== undefined) {
      const payload = parseSafeJson(existing.public_payload_json) as Record<
        string,
        unknown
      >;
      const repair = payload["repairMetadata"] as
        | Record<string, unknown>
        | undefined;
      return repair?.["authorizationHash"] === authorizationHash
        ? {
            kind: "replayed",
            reportId: authorization.reportId,
            versionId: existing.version_id,
            artifactId: existing.artifact_id,
            digest: existing.content_hash,
          }
        : { kind: "rejected", reason: "report_repair_conflict" };
    }
    source = database
      .prepare(`SELECT report_versions.version_id, report_versions.artifact_id,
      artifacts.content_hash, report_versions.snapshot_id, report_versions.published_at,
      report_versions.public_payload_json, runs.report_id AS run_report_id
      , research_requests.locale
      FROM report_versions JOIN artifacts USING(artifact_id)
      JOIN runs ON runs.run_id = report_versions.run_id
      JOIN research_requests ON research_requests.run_id = report_versions.run_id
      WHERE report_versions.run_id = ? AND report_versions.report_id = ?
        AND report_versions.version = ?`)
      .get(
        authorization.runId,
        authorization.reportId,
        authorization.sourceVersion,
      ) as typeof source;
  } finally {
    database.close();
  }
  if (
    source === undefined ||
    source.run_report_id !== authorization.reportId ||
    source.version_id !== authorization.sourceVersionId ||
    source.artifact_id !== authorization.sourceArtifactId ||
    source.content_hash !== authorization.sourceDigest
  )
    return { kind: "rejected", reason: "source_authorization_mismatch" };
  const sourceArtifact = await options.cas.get(
    ArtifactDigestSchema.parse(source.content_hash),
  );
  if (
    sourceArtifact === undefined ||
    sourceArtifact.descriptor.artifactId !== source.artifact_id ||
    sourceArtifact.descriptor.runId !== authorization.runId ||
    sourceArtifact.descriptor.snapshotId !== source.snapshot_id ||
    hashBytes(sourceArtifact.bytes) !== source.content_hash
  )
    return {
      kind: "rejected",
      reason: "source_artifact_authentication_failed",
    };
  let rawReport: unknown;
  let rawPayload: unknown;
  try {
    rawReport = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(sourceArtifact.bytes),
    );
    rawPayload = parseSafeJson(source.public_payload_json);
    rawReport = applyExactTextPatches(rawReport, authorization.reportPatches);
    rawPayload = applyExactTextPatches(
      rawPayload,
      authorization.publicationPatches,
    );
  } catch (error) {
    return {
      kind: "rejected",
      reason: error instanceof Error ? error.message : "text_patch_failed",
    };
  }
  const versionId = ReportVersionIdSchema.parse(
    deterministicUuid(authorizationHash, "version"),
  );
  const artifactId = ArtifactIdSchema.parse(
    deterministicUuid(authorizationHash, "artifact"),
  );
  const reportShape = WorkflowV2ResearchReportSchema.safeParse({
    ...(rawReport as Record<string, unknown>),
    version: targetVersion,
    versionId,
    versionDelta: {
      priorVersionId: authorization.sourceVersionId,
      addedClaimIds: [],
      removedClaimIds: [],
    },
  });
  if (!reportShape.success)
    return { kind: "rejected", reason: "repaired_report_invalid" };
  const payload = rawPayload as Record<string, unknown>;
  const envelope = SavedEnvelopeSchema.safeParse(
    payload["editorialPublication"],
  );
  if (
    !envelope.success ||
    !evaluatePrePublicationEditorialGate(
      (envelope.data as unknown as PrePublicationEditorialEnvelope).candidate,
    ).publishable
  )
    return { kind: "rejected", reason: "repaired_editorial_gate_failed" };
  const bytes = new TextEncoder().encode(
    canonicalJson(
      singleLocaleReportForStorage(reportShape.data, source.locale),
    ),
  );
  const descriptor = await options.cas.put({
    artifactId,
    runId: RunIdSchema.parse(authorization.runId),
    snapshotId: SnapshotIdSchema.parse(source.snapshot_id),
    mediaType: "application/vnd.stocksembly.research-report+json",
    parentDigests: [ArtifactDigestSchema.parse(source.content_hash)],
    bytes,
  });
  const publishedAt = new Date(
    Date.parse(source.published_at) + 1,
  ).toISOString();
  const publicPayload = {
    ...payload,
    reportArtifactDigest: descriptor.digest,
    version: targetVersion,
    priorVersionId: authorization.sourceVersionId,
    repairMetadata: {
      authorizationHash,
      supersedesVersion: authorization.sourceVersion,
      persistenceHash: authorization.persistenceHash,
    },
  };
  const writer = new Database(options.databasePath, { timeout: 5_000 });
  writer.pragma("foreign_keys = ON");
  try {
    writer
      .transaction(() => {
        const current = writer
          .prepare(`SELECT version_id, artifact_id FROM report_versions
        WHERE report_id = ? AND version = ?`)
          .get(authorization.reportId, authorization.sourceVersion) as
          | { version_id: string; artifact_id: string }
          | undefined;
        const target = writer
          .prepare(`SELECT version_id FROM report_versions
        WHERE report_id = ? AND version = ?`)
          .get(authorization.reportId, targetVersion);
        if (
          current?.version_id !== authorization.sourceVersionId ||
          current.artifact_id !== authorization.sourceArtifactId ||
          target !== undefined
        )
          throw new TypeError("report_text_repair_concurrent_conflict");
        writer
          .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id, content_hash,
        byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            artifactId,
            authorization.runId,
            source.snapshot_id,
            descriptor.digest,
            descriptor.byteLength,
            descriptor.mediaType,
            `report_version:${versionId}`,
            descriptor.digest,
            publishedAt,
          );
        writer
          .prepare(`INSERT INTO artifact_edges(child_artifact_id, parent_artifact_id, relation)
        VALUES (?, ?, 'derived-from')`)
          .run(artifactId, authorization.sourceArtifactId);
        writer
          .prepare(`INSERT INTO report_versions(version_id, report_id, run_id, snapshot_id,
        version, artifact_id, status, published_at, public_payload_json)
        SELECT ?, report_id, run_id, snapshot_id, ?, ?, status, ?, ? FROM report_versions
        WHERE report_id = ? AND version = ?`)
          .run(
            versionId,
            targetVersion,
            artifactId,
            publishedAt,
            serializeSafeJson(publicPayload),
            authorization.reportId,
            authorization.sourceVersion,
          );
      })
      .immediate();
  } finally {
    writer.close();
  }
  return {
    kind: "published",
    reportId: authorization.reportId,
    versionId,
    artifactId,
    digest: descriptor.digest,
  };
}

export const EXACT_TEXT_REPAIR_PERSISTENCE_HASH = hashCanonical({
  implementation: "exact-authorized-public-text-patches:n-to-n-plus-one:v1",
  serialization: "canonical-single-locale-report",
});

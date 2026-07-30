import { canonicalJson } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
} from "../domain/ids";
import type { ResearchReport } from "../domain/report";
import { singleLocaleReportForStorage } from "../domain/reportStorage";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  ArtifactDigestSchema,
} from "../ports/artifacts";
import type { ReportVersionWrite } from "../ports/reportVersions";
import { assembleReport } from "./assembleReport";
import type { AssemblyInput } from "./assembleReportContracts";

export type AuthoritativeReportCommit = {
  readonly version: ReportVersionWrite;
  readonly descriptor: ArtifactDescriptor;
  readonly parentArtifactIds: readonly string[];
};

export type ReportVersionPersistence = {
  readonly save: (input: AuthoritativeReportCommit) => number;
};

type PersistenceOptions = {
  readonly cas: ArtifactCasPort;
  readonly persistence: ReportVersionPersistence;
  readonly now?: () => string;
};

type AuthoritativeReportInput = AssemblyInput & {
  readonly reportArtifactId: string;
  readonly structuralAuditArtifactId: string;
  readonly parentArtifacts: readonly {
    readonly artifactId: string;
    readonly digest: string;
  }[];
};

export type PersistAuthoritativeReportResult =
  | {
      readonly kind: "published";
      readonly report: ResearchReport;
      readonly descriptor: ArtifactDescriptor;
    }
  | { readonly kind: "blocked"; readonly reason: string };

export async function persistAuthoritativeReport(
  options: PersistenceOptions,
  input: AuthoritativeReportInput,
): Promise<PersistAuthoritativeReportResult> {
  const assembled = assembleReport(input);
  if (assembled.kind === "blocked") return assembled;
  const reportArtifactId = ArtifactIdSchema.safeParse(input.reportArtifactId);
  const reportId = ReportIdSchema.safeParse(input.reportId);
  const versionId = ReportVersionIdSchema.safeParse(input.versionId);
  const parentDigests = input.parentArtifacts.map((parent) =>
    ArtifactDigestSchema.safeParse(parent.digest),
  );
  const requiredParentIds = new Set([
    ...assembled.report.artifacts.map((artifact) => artifact.artifactId),
    input.semanticAudit !== null && typeof input.semanticAudit === "object"
      ? Reflect.get(input.semanticAudit, "artifactId")
      : undefined,
    input.structuralAuditArtifactId,
  ]);
  const requiredParentCount = assembled.report.artifacts.length + 2;
  if (
    !reportArtifactId.success ||
    !reportId.success ||
    !versionId.success ||
    parentDigests.length !== requiredParentCount ||
    parentDigests.some((digest) => !digest.success) ||
    new Set(input.parentArtifacts.map((parent) => parent.digest)).size !==
      requiredParentCount ||
    new Set(input.parentArtifacts.map((parent) => parent.artifactId)).size !==
      requiredParentCount ||
    requiredParentIds.size !== requiredParentCount ||
    input.parentArtifacts.some(
      (parent) => !requiredParentIds.has(parent.artifactId),
    )
  )
    return { kind: "blocked", reason: "invalid_persistence_lineage" };
  const parsedDigests = parentDigests.flatMap((digest) =>
    digest.success ? [digest.data] : [],
  );
  const authenticatedParents = await Promise.all(
    parsedDigests.map(async (digest) => await options.cas.get(digest)),
  );
  if (
    authenticatedParents.some((parent, index) => {
      const expected = input.parentArtifacts[index];
      return (
        parent === undefined ||
        expected === undefined ||
        parent.descriptor.artifactId !== expected.artifactId ||
        parent.descriptor.runId !== assembled.report.runId ||
        parent.descriptor.snapshotId !== assembled.report.snapshotId
      );
    })
  )
    return { kind: "blocked", reason: "parent_artifact_authentication_failed" };
  const bytes = new TextEncoder().encode(
    canonicalJson(
      singleLocaleReportForStorage(assembled.report, input.locale ?? "en"),
    ),
  );
  const descriptor = await options.cas.put({
    artifactId: reportArtifactId.data,
    runId: assembled.report.runId,
    snapshotId: assembled.report.snapshotId,
    mediaType: "application/vnd.stocksembly.research-report+json",
    parentDigests: parsedDigests,
    bytes,
  });
  options.persistence.save({
    descriptor,
    parentArtifactIds: input.parentArtifacts.map((parent) => parent.artifactId),
    version: {
      reportId: reportId.data,
      versionId: versionId.data,
      runId: assembled.report.runId,
      snapshotId: assembled.report.snapshotId,
      artifactId: reportArtifactId.data,
      status: assembled.report.status,
      publishedAt: options.now?.() ?? new Date().toISOString(),
      publicPayload: {
        schemaVersion: assembled.report.schemaVersion,
        reportArtifactDigest: descriptor.digest,
        version: assembled.report.version,
        priorVersionId: assembled.report.versionDelta.priorVersionId,
        status: assembled.report.status,
        claimIds: assembled.report.claims.map((claim) => claim.claimId),
        sourceIds: assembled.report.sources.map((source) => source.sourceId),
        limitationIds: assembled.report.limitations.map(
          (limitation) => limitation.id,
        ),
      },
      expectedVersion: assembled.report.version,
      priorVersionId: assembled.report.versionDelta.priorVersionId,
    },
  });
  return { kind: "published", report: assembled.report, descriptor };
}

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashBytes } from "../../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import {
  type ArtifactCasPort,
  ArtifactDigestSchema,
  type ArtifactRead,
} from "../../../ports/artifacts";
import { workflowV2PresentationFixture } from "../../../workflowV2Presentation.testSupport";
import {
  EXACT_TEXT_REPAIR_PERSISTENCE_HASH,
  type PublishedExactTextRepairAuthorization,
  repairPublishedReportExactText,
} from "./repairPublishedAuthoritativeReport";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

function authorization(
  persistenceHash: string,
): PublishedExactTextRepairAuthorization {
  return {
    runId: "00000000-0000-4000-8000-000000000001",
    reportId: "00000000-0000-4000-8000-000000000002",
    sourceVersion: 1,
    sourceVersionId: "00000000-0000-4000-8000-000000000003",
    sourceArtifactId: "00000000-0000-4000-8000-000000000004",
    sourceDigest: "a".repeat(64),
    reportPatches: [],
    publicationPatches: [],
    persistenceHash,
  };
}

function rejectingCas() {
  const cas: ArtifactCasPort = {
    get: vi.fn(() => Promise.reject(new TypeError("CAS must not be read"))),
    has: vi.fn(() => Promise.reject(new TypeError("CAS must not be read"))),
    put: vi.fn(() => Promise.reject(new TypeError("CAS must not be written"))),
  };
  return cas;
}

const provenanceIds = {
  runId: "10000000-0000-4000-8000-000000000001",
  reportId: "10000000-0000-4000-8000-000000000002",
  versionId: "10000000-0000-4000-8000-000000000003",
  artifactId: "10000000-0000-4000-8000-000000000004",
  snapshotId: "10000000-0000-4000-8000-000000000005",
} as const;

function provenanceFixture(fault: "run" | "snapshot" | "bytes"): {
  readonly databasePath: string;
  readonly cas: ArtifactCasPort;
  readonly authorization: PublishedExactTextRepairAuthorization;
} {
  const root = mkdtempSync(join(tmpdir(), "stocksembly-repair-provenance-"));
  roots.push(root);
  const databasePath = join(root, "repair.sqlite");
  const authenticBytes = new TextEncoder().encode("{}");
  const sourceDigest = ArtifactDigestSchema.parse(hashBytes(authenticBytes));
  const substitutedBytes = new TextEncoder().encode(
    JSON.stringify(workflowV2PresentationFixture()),
  );
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE runs(run_id TEXT PRIMARY KEY, report_id TEXT NOT NULL);
    CREATE TABLE research_requests(run_id TEXT PRIMARY KEY, locale TEXT NOT NULL);
    CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL);
    CREATE TABLE report_versions(
      version_id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      artifact_id TEXT NOT NULL,
      published_at TEXT NOT NULL,
      public_payload_json TEXT NOT NULL
    );
  `);
  database
    .prepare("INSERT INTO runs(run_id, report_id) VALUES (?, ?)")
    .run(provenanceIds.runId, provenanceIds.reportId);
  database
    .prepare("INSERT INTO research_requests(run_id, locale) VALUES (?, 'en')")
    .run(provenanceIds.runId);
  database
    .prepare("INSERT INTO artifacts(artifact_id, content_hash) VALUES (?, ?)")
    .run(provenanceIds.artifactId, sourceDigest);
  database
    .prepare(`INSERT INTO report_versions(version_id, report_id, run_id, snapshot_id,
      version, artifact_id, published_at, public_payload_json)
      VALUES (?, ?, ?, ?, 1, ?, '2026-08-01T00:00:00.000Z', '{}')`)
    .run(
      provenanceIds.versionId,
      provenanceIds.reportId,
      provenanceIds.runId,
      provenanceIds.snapshotId,
      provenanceIds.artifactId,
    );
  database.close();

  const read: ArtifactRead = {
    descriptor: {
      artifactId: ArtifactIdSchema.parse(provenanceIds.artifactId),
      runId: RunIdSchema.parse(
        fault === "run"
          ? "20000000-0000-4000-8000-000000000001"
          : provenanceIds.runId,
      ),
      snapshotId: SnapshotIdSchema.parse(
        fault === "snapshot"
          ? "20000000-0000-4000-8000-000000000002"
          : provenanceIds.snapshotId,
      ),
      digest: sourceDigest,
      byteLength:
        fault === "bytes"
          ? substitutedBytes.byteLength
          : authenticBytes.byteLength,
      mediaType: "application/vnd.stocksembly.research-report+json",
      parentDigests: [],
    },
    bytes: fault === "bytes" ? substitutedBytes : authenticBytes,
  };
  const cas: ArtifactCasPort = {
    get: vi.fn(() => Promise.resolve(read)),
    has: vi.fn(() => Promise.resolve(true)),
    put: vi.fn(() => Promise.reject(new TypeError("CAS put must not occur"))),
  };
  return {
    databasePath,
    cas,
    authorization: {
      runId: provenanceIds.runId,
      reportId: provenanceIds.reportId,
      sourceVersion: 1,
      sourceVersionId: provenanceIds.versionId,
      sourceArtifactId: provenanceIds.artifactId,
      sourceDigest,
      reportPatches: [],
      publicationPatches: [],
      persistenceHash: EXACT_TEXT_REPAIR_PERSISTENCE_HASH,
    },
  };
}

function targetVersionCount(databasePath: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    return (
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM report_versions WHERE version = 2",
        )
        .get() as { count: number }
    ).count;
  } finally {
    database.close();
  }
}

describe("exact text repair persistence authorization", () => {
  it("rejects a wrong persistence hash before database or CAS access", async () => {
    const root = mkdtempSync(join(tmpdir(), "stocksembly-repair-security-"));
    roots.push(root);
    const databasePath = join(root, "must-not-be-created.sqlite");
    const cas = rejectingCas();

    await expect(
      repairPublishedReportExactText(
        { databasePath, cas },
        authorization("wrong-persistence-hash"),
      ),
    ).resolves.toEqual({
      kind: "rejected",
      reason: "persistence_hash_mismatch",
    });
    expect(existsSync(databasePath)).toBe(false);
    expect(cas.get).not.toHaveBeenCalled();
    expect(cas.has).not.toHaveBeenCalled();
    expect(cas.put).not.toHaveBeenCalled();
  });

  it("continues to existing validation when the persistence hash matches", async () => {
    const cas = rejectingCas();
    const validHash = authorization(EXACT_TEXT_REPAIR_PERSISTENCE_HASH);

    await expect(
      repairPublishedReportExactText(
        { databasePath: "unused.sqlite", cas },
        { ...validHash, sourceVersion: 0 },
      ),
    ).resolves.toEqual({ kind: "rejected", reason: "source_version_invalid" });
    expect(cas.get).not.toHaveBeenCalled();
    expect(cas.has).not.toHaveBeenCalled();
    expect(cas.put).not.toHaveBeenCalled();
  });

  it.each([
    ["run", "a descriptor from another run"],
    ["snapshot", "a descriptor from another snapshot"],
    ["bytes", "valid-schema bytes whose digest differs from the source row"],
  ] as const)(
    "rejects %s provenance substitution: %s",
    async (fault, _description) => {
      const fixture = provenanceFixture(fault);

      await expect(
        repairPublishedReportExactText(
          { databasePath: fixture.databasePath, cas: fixture.cas },
          fixture.authorization,
        ),
      ).resolves.toEqual({
        kind: "rejected",
        reason: "source_artifact_authentication_failed",
      });
      expect(fixture.cas.put).not.toHaveBeenCalled();
      expect(targetVersionCount(fixture.databasePath)).toBe(0);
    },
  );
});

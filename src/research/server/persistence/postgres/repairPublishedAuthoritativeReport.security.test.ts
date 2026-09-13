import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchTestDatabase } from "../../../../test/researchPostgres";
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
import type { ResearchDatabase } from "./database";
import {
  EXACT_TEXT_REPAIR_PERSISTENCE_HASH,
  type PublishedExactTextRepairAuthorization,
  repairPublishedReportExactText,
} from "./repairPublishedAuthoritativeReport";

const roots: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
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
async function provenanceFixture(fault: "run" | "snapshot" | "bytes") {
  const root = mkdtempSync(join(tmpdir(), "stocksembly-repair-provenance-"));
  roots.push(root);
  const fixture = await createResearchTestDatabase();
  cleanups.push(fixture.close);
  const database = fixture.pool;
  const authenticBytes = new TextEncoder().encode("{}");
  const sourceDigest = ArtifactDigestSchema.parse(hashBytes(authenticBytes));
  const substitutedBytes = new TextEncoder().encode(
    JSON.stringify(workflowV2PresentationFixture()),
  );
  await database.query(`DROP SCHEMA research CASCADE; CREATE SCHEMA research;
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
  await database.query(`INSERT INTO runs(run_id, report_id) VALUES ($1, $2)`, [
    provenanceIds.runId,
    provenanceIds.reportId,
  ]);
  await database.query(
    `INSERT INTO research_requests(run_id, locale) VALUES ($1, 'en')`,
    [provenanceIds.runId],
  );
  await database.query(
    `INSERT INTO artifacts(artifact_id, content_hash) VALUES ($1, $2)`,
    [provenanceIds.artifactId, sourceDigest],
  );
  await database.query(
    `INSERT INTO report_versions(version_id, report_id, run_id, snapshot_id,
      version, artifact_id, published_at, public_payload_json)
      VALUES ($1, $2, $3, $4, 1, $5, '2026-08-01T00:00:00.000Z', '{}')`,
    [
      provenanceIds.versionId,
      provenanceIds.reportId,
      provenanceIds.runId,
      provenanceIds.snapshotId,
      provenanceIds.artifactId,
    ],
  );
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
    database,
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
async function targetVersionCount(database: ResearchDatabase) {
  return (
    (
      await database.query(
        `SELECT COUNT(*)::int AS count FROM report_versions WHERE version = 2`,
        [],
      )
    ).rows[0] as {
      count: number;
    }
  ).count;
}
describe("exact text repair persistence authorization", () => {
  it("rejects a wrong persistence hash before database or CAS access", async () => {
    const root = mkdtempSync(join(tmpdir(), "stocksembly-repair-security-"));
    roots.push(root);
    const fixture = await createResearchTestDatabase();
    cleanups.push(fixture.close);
    const database = fixture.pool;
    const query = vi.spyOn(database, "query");
    const cas = rejectingCas();
    await expect(
      repairPublishedReportExactText(
        { database, cas },
        authorization("wrong-persistence-hash"),
      ),
    ).resolves.toEqual({
      kind: "rejected",
      reason: "persistence_hash_mismatch",
    });
    expect(query).not.toHaveBeenCalled();
    expect(cas.get).not.toHaveBeenCalled();
    expect(cas.has).not.toHaveBeenCalled();
    expect(cas.put).not.toHaveBeenCalled();
  });
  it("continues to existing validation when the persistence hash matches", async () => {
    const cas = rejectingCas();
    const validHash = authorization(EXACT_TEXT_REPAIR_PERSISTENCE_HASH);
    const fixture = await createResearchTestDatabase();
    cleanups.push(fixture.close);
    await expect(
      repairPublishedReportExactText(
        { database: fixture.pool, cas },
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
      const fixture = await provenanceFixture(fault);
      await expect(
        repairPublishedReportExactText(
          { database: fixture.database, cas: fixture.cas },
          fixture.authorization,
        ),
      ).resolves.toEqual({
        kind: "rejected",
        reason: "source_artifact_authentication_failed",
      });
      expect(fixture.cas.put).not.toHaveBeenCalled();
      expect(await targetVersionCount(fixture.database)).toBe(0);
    },
  );
});

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { CommittedArtifactMetadata } from "../../../compositions/officialWorkerMetadata";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { ArtifactDigestSchema } from "../../../ports/artifacts";
import { buildTechnicalChart } from "../../../technical/buildTechnicalChart";
import { stageAcceptedSpecialists } from "../../../workflow/departmentRound.testSupport";
import { persistOptionalTechnicalChart } from "./technicalChartArtifact";

it("keeps chart metadata and lineage available after reopening and in production sync inventory", async () => {
  const root = mkdtempSync(join(tmpdir(), "technical-chart-persistence-"));
  try {
    const prepared = await stageAcceptedSpecialists(root, "none");
    const runId = RunIdSchema.parse(prepared.harness.input.mandate.runId);
    const snapshotId = SnapshotIdSchema.parse(prepared.replay.snapshotId);
    const chart = buildTechnicalChart({
      symbol: "TEST",
      asOf: "2026-07-23T00:00:00.000Z",
      sets: [],
    });
    const source = await prepared.options.cas.put({
      artifactId: ArtifactIdSchema.parse(randomUUID()),
      runId,
      snapshotId,
      mediaType: "application/json",
      parentDigests: [],
      bytes: new TextEncoder().encode(
        JSON.stringify({ technicalChart: chart }),
      ),
    });
    const db = new Database(prepared.options.databasePath);
    let digest: string;
    try {
      db.prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'evidence:insightsentry:technical', ?, ?)`).run(
        source.artifactId,
        runId,
        snapshotId,
        source.digest,
        source.byteLength,
        source.mediaType,
        source.digest,
        chart.analysisAsOf,
      );
      const saved = await persistOptionalTechnicalChart(
        db,
        prepared.options.cas,
        runId,
        snapshotId,
      );
      expect(saved).toBeDefined();
      digest = ArtifactDigestSchema.parse(saved?.digest);
      expect(
        await persistOptionalTechnicalChart(
          db,
          prepared.options.cas,
          runId,
          snapshotId,
        ),
      ).toEqual(saved);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM artifacts WHERE content_hash = ?",
          )
          .get(digest),
      ).toEqual({ count: 1 });
      expect(
        db
          .prepare(`SELECT COUNT(*) AS count FROM artifact_edges e
        JOIN artifacts a ON a.artifact_id = e.child_artifact_id
        WHERE a.content_hash = ?`)
          .get(digest),
      ).toEqual({ count: 2 });
    } finally {
      db.close();
    }
    const reopened = new CommittedArtifactMetadata(
      prepared.options.databasePath,
    );
    try {
      const metadata = await reopened.find(ArtifactDigestSchema.parse(digest));
      expect(metadata?.parentDigests).toContain(source.digest);
      expect(metadata?.mediaType).toBe(
        "application/vnd.stocksembly.technical-chart+json",
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

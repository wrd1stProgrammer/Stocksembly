import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

it("persists charts with a read-only authority reader and retains metadata after reopening", async () => {
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
    let db = prepared.options.database;
    let digest: string;
    {
      await db.query(
        `INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'evidence:insightsentry:technical', $7, $8)`,
        [
          source.artifactId,
          runId,
          snapshotId,
          source.digest,
          source.byteLength,
          source.mediaType,
          source.digest,
          chart.analysisAsOf,
        ],
      );
      db = prepared.options.database;
      const reader = await db.connect();
      await reader.query("BEGIN READ ONLY");
      expect(
        (await reader.query("SHOW transaction_read_only")).rows[0],
      ).toEqual({ transaction_read_only: "on" });
      await reader.query("ROLLBACK");
      reader.release();
      const saved = await persistOptionalTechnicalChart(
        prepared.options.database,
        prepared.options.cas,
        runId,
        snapshotId,
      );
      expect(saved).toBeDefined();
      digest = ArtifactDigestSchema.parse(saved?.digest);
      expect(
        await persistOptionalTechnicalChart(
          prepared.options.database,
          prepared.options.cas,
          runId,
          snapshotId,
        ),
      ).toEqual(saved);
      expect(
        (
          await db.query(
            `SELECT COUNT(*)::int AS count FROM artifacts WHERE content_hash = $1`,
            [digest],
          )
        ).rows[0],
      ).toEqual({ count: 1 });
      expect(
        (
          await db.query(
            `SELECT COUNT(*)::int AS count FROM artifact_edges e
        JOIN artifacts a ON a.artifact_id = e.child_artifact_id
        WHERE a.content_hash = $1`,
            [digest],
          )
        ).rows[0],
      ).toEqual({ count: 2 });
    }
    const reopened = new CommittedArtifactMetadata(prepared.options.database);
    try {
      const metadata = await reopened.find(ArtifactDigestSchema.parse(digest));
      expect(metadata?.parentDigests).toContain(source.digest);
      expect(metadata?.mediaType).toBe(
        "application/vnd.stocksembly.technical-chart+json",
      );
    } finally {
      await reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

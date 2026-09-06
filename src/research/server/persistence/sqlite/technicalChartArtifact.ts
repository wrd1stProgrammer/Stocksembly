import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { canonicalJson, hashBytes } from "../../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import {
  type TechnicalChartManifest,
  TechnicalChartSnapshotSchema,
} from "../../../domain/technicalChart";
import {
  type ArtifactCasPort,
  ArtifactDigestSchema,
} from "../../../ports/artifacts";
import { applyJuneChartCommentary } from "../../../technical/buildTechnicalChart";

const RowSchema = z.object({
  artifact_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
});
export async function persistOptionalTechnicalChart(
  database: Database.Database,
  cas: ArtifactCasPort,
  runId: string,
  snapshotId: string,
): Promise<TechnicalChartManifest | undefined> {
  try {
    const row = RowSchema.safeParse(
      database
        .prepare(
          "SELECT artifact_id, run_id, snapshot_id, content_hash FROM artifacts WHERE snapshot_id = ? AND logical_key = 'evidence:insightsentry:technical' LIMIT 1",
        )
        .get(snapshotId),
    );
    if (!row.success) return undefined;
    const source = await cas.get(row.data.content_hash);
    if (
      !source ||
      source.descriptor.artifactId !== row.data.artifact_id ||
      source.descriptor.snapshotId !== snapshotId ||
      hashBytes(source.bytes) !== row.data.content_hash
    )
      return undefined;
    const value = z
      .object({ technicalChart: TechnicalChartSnapshotSchema })
      .safeParse(JSON.parse(new TextDecoder().decode(source.bytes)));
    if (!value.success) return undefined;
    let chart = value.data.technicalChart;
    const parentDigests = [row.data.content_hash];
    const memoRow = RowSchema.safeParse(
      database
        .prepare(
          "SELECT artifact_id, run_id, snapshot_id, content_hash FROM artifacts WHERE run_id = ? AND logical_key = 'memo:market_news' LIMIT 1",
        )
        .get(runId),
    );
    if (memoRow.success) {
      const memo = await cas.get(memoRow.data.content_hash);
      if (
        memo &&
        memo.descriptor.runId === runId &&
        memo.descriptor.snapshotId === snapshotId &&
        hashBytes(memo.bytes) === memoRow.data.content_hash
      ) {
        const parsed = z
          .object({
            payload: z.object({
              chartCommentaryJson: z.string().nullable().optional(),
            }),
          })
          .safeParse(JSON.parse(new TextDecoder().decode(memo.bytes)));
        if (parsed.success) {
          chart = applyJuneChartCommentary(
            chart,
            parsed.data.payload.chartCommentaryJson,
          );
          parentDigests.push(memoRow.data.content_hash);
        }
      }
    }
    const artifact = await cas.put({
      artifactId: ArtifactIdSchema.parse(randomUUID()),
      runId: RunIdSchema.parse(runId),
      snapshotId: SnapshotIdSchema.parse(snapshotId),
      mediaType: "application/vnd.stocksembly.technical-chart+json",
      parentDigests,
      bytes: new TextEncoder().encode(canonicalJson(chart)),
    });
    database
      .transaction(() => {
        database
          .prepare(`INSERT OR IGNORE INTO artifacts(
        artifact_id, run_id, snapshot_id, content_hash, byte_length,
        media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            artifact.artifactId,
            runId,
            snapshotId,
            artifact.digest,
            artifact.byteLength,
            artifact.mediaType,
            `technical-chart:${artifact.digest}`,
            artifact.digest,
            new Date().toISOString(),
          );
        const saved = z
          .object({ artifact_id: ArtifactIdSchema })
          .parse(
            database
              .prepare(
                "SELECT artifact_id FROM artifacts WHERE snapshot_id = ? AND content_hash = ?",
              )
              .get(snapshotId, artifact.digest),
          );
        for (const parentDigest of parentDigests) {
          database
            .prepare(`INSERT OR IGNORE INTO artifact_edges(
          child_artifact_id, parent_artifact_id, relation)
          SELECT ?, artifact_id, 'derived-from' FROM artifacts
          WHERE snapshot_id = ? AND content_hash = ?`)
            .run(saved.artifact_id, snapshotId, parentDigest);
        }
      })
      .immediate();
    process.stdout.write(
      `${JSON.stringify({
        kind: "technical_chart_saved",
        runId,
        status: chart.status,
        commentarySource: chart.commentarySource,
        frames: chart.frames.map((frame) => ({
          timeframe: frame.timeframe,
          bars: frame.bars.length,
          drawings: frame.drawings.length,
          status: frame.status,
        })),
      })}\n`,
    );
    return {
      schemaVersion: "technical-chart-v1",
      digest: artifact.digest,
      analysisAsOf: chart.analysisAsOf,
      status: chart.status,
    };
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ kind: "optional_technical_chart_omitted", runId, error: error instanceof Error ? error.name : "unknown" })}\n`,
    );
    return undefined;
  }
}

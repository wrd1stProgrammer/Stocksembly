import { randomUUID } from "node:crypto";
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
import { type ResearchDatabase, researchTransaction } from "./database";

const RowSchema = z.object({
  artifact_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
});
export async function persistOptionalTechnicalChart(
  database: ResearchDatabase,
  cas: ArtifactCasPort,
  runId: string,
  snapshotId: string,
): Promise<TechnicalChartManifest | undefined> {
  try {
    const row = RowSchema.safeParse(
      (
        await database.query(
          `SELECT artifact_id, run_id, snapshot_id, content_hash FROM research.artifacts WHERE snapshot_id = $1 AND logical_key = 'evidence:insightsentry:technical' LIMIT 1`,
          [snapshotId],
        )
      ).rows[0],
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
      (
        await database.query(
          `SELECT artifact_id, run_id, snapshot_id, content_hash FROM research.artifacts WHERE run_id = $1 AND logical_key = 'memo:market_news' LIMIT 1`,
          [runId],
        )
      ).rows[0],
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
    await researchTransaction(database, async (database) => {
      await database.query(
        `INSERT INTO research.artifacts(
        artifact_id, run_id, snapshot_id, content_hash, byte_length,
        media_type, logical_key, input_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [
          artifact.artifactId,
          runId,
          snapshotId,
          artifact.digest,
          artifact.byteLength,
          artifact.mediaType,
          `technical-chart:${artifact.digest}`,
          artifact.digest,
          new Date().toISOString(),
        ],
      );
      const saved = z
        .object({ artifact_id: ArtifactIdSchema })
        .parse(
          (
            await database.query(
              `SELECT artifact_id FROM research.artifacts WHERE snapshot_id = $1 AND content_hash = $2`,
              [snapshotId, artifact.digest],
            )
          ).rows[0],
        );
      for (const parentDigest of parentDigests) {
        await database.query(
          `INSERT INTO research.artifact_edges(
          child_artifact_id, parent_artifact_id, relation)
          SELECT $1, artifact_id, 'derived-from' FROM research.artifacts
          WHERE snapshot_id = $2 AND content_hash = $3 ON CONFLICT DO NOTHING`,
          [saved.artifact_id, snapshotId, parentDigest],
        );
      }
    });
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

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createResearchTestDatabase } from "../../../../test/researchPostgres";
import { scheduleStageRecovery } from "../../../compositions/workflowStageRecovery";
import { researchTransaction } from "./database";
import {
  EMPTY_RESEARCH_QUALITY_METRICS,
  persistResearchQualityObservation,
  readResearchQualityObservation,
} from "./researchQualityObservations";

const roots: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
const runId = "10000000-0000-4000-8000-000000000001";
const snapshotId = "20000000-0000-4000-8000-000000000002";
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
async function observationDatabase() {
  const root = mkdtempSync(join(tmpdir(), "quality-observation-"));
  roots.push(root);
  const fixture = await createResearchTestDatabase();
  cleanups.push(fixture.close);
  const database = fixture.pool;
  const path = database;
  await researchTransaction(database, async (database) => {
    await database.query(
      `INSERT INTO runs(run_id, snapshot_id, status, created_at)
      VALUES ($1, $2, 'running', '2026-08-29T00:00:00.000Z')`,
      [runId, snapshotId],
    );
    await database.query(
      `INSERT INTO snapshots(snapshot_id, run_id, state, requested_at)
      VALUES ($1, $2, 'collecting', '2026-08-29T00:00:00.000Z')`,
      [snapshotId, runId],
    );
  });
  return { database, path };
}
it("persists one final observation with stable reasons and required metrics", async () => {
  // Given
  const { database } = await observationDatabase();
  // When
  await persistResearchQualityObservation(database, {
    runId,
    workflowVersion: "workflow-v3",
    reportVersion: "unpublished",
    outcome: "item_omitted",
    observedAt: "2026-08-29T00:00:01.000Z",
    metrics: { ...EMPTY_RESEARCH_QUALITY_METRICS, omittedClaims: 1 },
    reasonCodes: ["source_missing", "claim_ineligible", "source_missing"],
  });
  await persistResearchQualityObservation(database, {
    runId,
    workflowVersion: "workflow-v3",
    reportVersion: "30000000-0000-4000-8000-000000000003",
    outcome: "complete",
    observedAt: "2026-08-29T00:00:02.000Z",
    metrics: { ...EMPTY_RESEARCH_QUALITY_METRICS, groundedClaimRatio: 0.75 },
    reasonCodes: [],
  });
  // Then
  expect(await readResearchQualityObservation(database, runId)).toMatchObject({
    outcome: "item_omitted",
    reportVersion: "30000000-0000-4000-8000-000000000003",
    reasonCodes: ["claim_ineligible", "source_missing"],
    metrics: { omittedClaims: 1, groundedClaimRatio: 0.75 },
  });
  expect(
    (
      await database.query(
        `SELECT COUNT(*)::int AS count FROM research_quality_observations WHERE run_id = $1`,
        [runId],
      )
    ).rows[0],
  ).toEqual({ count: 1 });
});
it("keeps automatic stage recovery out of public run events", async () => {
  // Given
  const { path } = await observationDatabase();
  // When
  const result = await scheduleStageRecovery({
    database: path,
    runId,
    stage: "chair",
    reason: "provider_timeout",
    now: "2026-08-29T00:00:01.000Z",
  });
  // Then
  const persisted = path;
  expect(result).toBe("scheduled");
  expect(
    (
      await persisted.query(
        `SELECT COUNT(*)::int AS count FROM run_events WHERE run_id = $1`,
        [runId],
      )
    ).rows[0],
  ).toEqual({ count: 0 });
});

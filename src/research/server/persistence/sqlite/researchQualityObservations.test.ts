import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { scheduleStageRecovery } from "../../../compositions/workflowStageRecovery";
import {
  EMPTY_RESEARCH_QUALITY_METRICS,
  persistResearchQualityObservation,
  readResearchQualityObservation,
} from "./researchQualityObservations";
import { openSqliteStore } from "./sqliteStore";

const roots: string[] = [];
const runId = "10000000-0000-4000-8000-000000000001";
const snapshotId = "20000000-0000-4000-8000-000000000002";

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function observationDatabase(): {
  readonly database: Database.Database;
  readonly path: string;
} {
  const root = mkdtempSync(join(tmpdir(), "quality-observation-"));
  roots.push(root);
  const path = join(root, "research.sqlite");
  openSqliteStore(path).close();
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.exec("BEGIN");
  database
    .prepare(`INSERT INTO runs(run_id, snapshot_id, status, created_at)
      VALUES (?, ?, 'running', '2026-08-29T00:00:00.000Z')`)
    .run(runId, snapshotId);
  database
    .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state, requested_at)
      VALUES (?, ?, 'collecting', '2026-08-29T00:00:00.000Z')`)
    .run(snapshotId, runId);
  database.exec("COMMIT");
  return { database, path };
}

it("persists one final observation with stable reasons and required metrics", () => {
  // Given
  const { database } = observationDatabase();

  try {
    // When
    persistResearchQualityObservation(database, {
      runId,
      workflowVersion: "workflow-v3",
      reportVersion: "unpublished",
      outcome: "item_omitted",
      observedAt: "2026-08-29T00:00:01.000Z",
      metrics: { ...EMPTY_RESEARCH_QUALITY_METRICS, omittedClaims: 1 },
      reasonCodes: ["source_missing", "claim_ineligible", "source_missing"],
    });
    persistResearchQualityObservation(database, {
      runId,
      workflowVersion: "workflow-v3",
      reportVersion: "30000000-0000-4000-8000-000000000003",
      outcome: "complete",
      observedAt: "2026-08-29T00:00:02.000Z",
      metrics: { ...EMPTY_RESEARCH_QUALITY_METRICS, groundedClaimRatio: 0.75 },
      reasonCodes: [],
    });

    // Then
    expect(readResearchQualityObservation(database, runId)).toMatchObject({
      outcome: "item_omitted",
      reportVersion: "30000000-0000-4000-8000-000000000003",
      reasonCodes: ["claim_ineligible", "source_missing"],
      metrics: { omittedClaims: 1, groundedClaimRatio: 0.75 },
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM research_quality_observations WHERE run_id = ?",
        )
        .get(runId),
    ).toEqual({ count: 1 });
  } finally {
    database.close();
  }
});

it("keeps automatic stage recovery out of public run events", () => {
  // Given
  const { database, path } = observationDatabase();
  database.close();

  // When
  const result = scheduleStageRecovery({
    databasePath: path,
    runId,
    stage: "chair",
    reason: "provider_timeout",
    now: "2026-08-29T00:00:01.000Z",
  });

  // Then
  const persisted = new Database(path, { readonly: true });
  try {
    expect(result).toBe("scheduled");
    expect(
      persisted
        .prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?")
        .get(runId),
    ).toEqual({ count: 0 });
  } finally {
    persisted.close();
  }
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { ChairSynthesisPostgresAuthority } from "./chairSynthesisAuthority";
import { workflowTestDatabase } from "./postgresDatabase.testSupport";

const RUN_ID = "00000000-0000-4000-8000-000000000101";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000102";
const JOB_ID = "00000000-0000-4000-8000-000000000103";
const HASH = "a".repeat(64);
const roots: string[] = [];

const unusedCas: ArtifactCasPort = {
  put: () => Promise.reject(new Error("not used")),
  get: () => Promise.resolve(undefined),
  has: () => Promise.resolve(false),
};

async function pendingChairDatabase(): Promise<ResearchDatabase> {
  const root = mkdtempSync(join(tmpdir(), "chair-retry-pending-"));
  roots.push(root);
  const path = await workflowTestDatabase();
  const database = path;
  await withResearchTransaction(database, async (transaction) => {
    await transaction.query(
      "INSERT INTO runs(run_id, snapshot_id, status, last_event_seq,\n        created_at) VALUES ($1, $2, 'running', 0, $3)",
      [RUN_ID, SNAPSHOT_ID, "2026-08-12T00:00:00.000Z"],
    );
    await transaction.query(
      "INSERT INTO snapshots(snapshot_id, run_id, state, requested_at,\n        evidence_cutoff_at, sealed_at) VALUES ($1, $2, 'sealed', $3, $4, $5)",
      [
        SNAPSHOT_ID,
        RUN_ID,
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
      ],
    );
  });
  await database.query(
    "INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key,\n      input_hash, status, created_at) VALUES ($1, $2, $3, 'research',\n      'chair_synthesis:chair', $4, 'retry-wait', $5)",
    [JOB_ID, RUN_ID, SNAPSHOT_ID, HASH, "2026-08-12T00:00:00.000Z"],
  );
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const attemptId = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
    await database.query(
      "INSERT INTO attempts(attempt_id, job_id, run_id, snapshot_id,\n        kind, status, logical_artifact_key, input_hash, created_at, outcome)\n        VALUES ($1, $2, $3, $4, 'research', 'failed', 'chair_synthesis:chair',\n        $5, $6, 'failed')",
      [
        attemptId,
        JOB_ID,
        RUN_ID,
        SNAPSHOT_ID,
        HASH,
        "2026-08-12T00:00:00.000Z",
      ],
    );
    await database.query(
      "INSERT INTO research_call_ordinals(run_id, ordinal, job_id,\n        attempt_id, logical_artifact_key, input_hash, reserved_at)\n        VALUES ($1, $2, $3, $4, 'chair_synthesis:chair', $5, $6)",
      [RUN_ID, ordinal, JOB_ID, attemptId, HASH, "2026-08-12T00:00:00.000Z"],
    );
  }

  return path;
}

afterEach(() => {
  while (roots.length > 0)
    rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

describe("workflow attempt replay state", () => {
  it("keeps the chair pending while its durable worker retry is waiting", async () => {
    const authority = new ChairSynthesisPostgresAuthority(
      await pendingChairDatabase(),
      { cas: unusedCas },
    );
    try {
      expect((await authority.replay(RUN_ID)).incompleteReason).toBe(
        "retry_pending",
      );
    } finally {
      authority.close();
    }
  });
});

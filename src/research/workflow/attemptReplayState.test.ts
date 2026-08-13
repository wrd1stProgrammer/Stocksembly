import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactCasPort } from "../ports/artifacts";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { ChairSynthesisSqliteAuthority } from "./chairSynthesisAuthority";

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

function pendingChairDatabase(): string {
  const root = mkdtempSync(join(tmpdir(), "chair-retry-pending-"));
  roots.push(root);
  const path = join(root, "research.sqlite");
  const database = new Database(path);
  applyOrderedMigrations(database);
  database.transaction(() => {
    database
      .prepare(`INSERT INTO runs(run_id, snapshot_id, status, last_event_seq,
        created_at) VALUES (?, ?, 'running', 0, ?)`)
      .run(RUN_ID, SNAPSHOT_ID, "2026-08-12T00:00:00.000Z");
    database
      .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state, requested_at,
        evidence_cutoff_at, sealed_at) VALUES (?, ?, 'sealed', ?, ?, ?)`)
      .run(
        SNAPSHOT_ID,
        RUN_ID,
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
      );
  })();
  database
    .prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key,
      input_hash, status, created_at) VALUES (?, ?, ?, 'research',
      'chair_synthesis:chair', ?, 'retry-wait', ?)`)
    .run(JOB_ID, RUN_ID, SNAPSHOT_ID, HASH, "2026-08-12T00:00:00.000Z");
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const attemptId = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
    database
      .prepare(`INSERT INTO attempts(attempt_id, job_id, run_id, snapshot_id,
        kind, status, logical_artifact_key, input_hash, created_at, outcome)
        VALUES (?, ?, ?, ?, 'research', 'failed', 'chair_synthesis:chair',
        ?, ?, 'failed')`)
      .run(
        attemptId,
        JOB_ID,
        RUN_ID,
        SNAPSHOT_ID,
        HASH,
        "2026-08-12T00:00:00.000Z",
      );
    database
      .prepare(`INSERT INTO research_call_ordinals(run_id, ordinal, job_id,
        attempt_id, logical_artifact_key, input_hash, reserved_at)
        VALUES (?, ?, ?, ?, 'chair_synthesis:chair', ?, ?)`)
      .run(
        RUN_ID,
        ordinal,
        JOB_ID,
        attemptId,
        HASH,
        "2026-08-12T00:00:00.000Z",
      );
  }
  database.close();
  return path;
}

afterEach(() => {
  while (roots.length > 0)
    rmSync(roots.pop() ?? "", { recursive: true, force: true });
});

describe("workflow attempt replay state", () => {
  it("keeps the chair pending while its durable worker retry is waiting", () => {
    const authority = new ChairSynthesisSqliteAuthority(
      pendingChairDatabase(),
      { cas: unusedCas },
    );
    try {
      expect(authority.replay(RUN_ID).incompleteReason).toBe("retry_pending");
    } finally {
      authority.close();
    }
  });
});

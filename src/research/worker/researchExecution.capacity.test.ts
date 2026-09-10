import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeExecutionCounts,
  researchQueueStatus,
} from "../server/persistence/sqlite/runExecutionRepository";
import { LeaseEngineFixture, uuid } from "./leaseEngine.testSupport";
import { activateNextRun } from "./leaseEngineSqliteAdmission";
import { claimNextJob } from "./leaseEngineSqliteClaim";

afterEach(() => vi.unstubAllEnvs());

describe("durable research capacity", () => {
  it("leases ten jobs per subscription run fairly and leaves excess jobs queued", () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    const fixture = new LeaseEngineFixture();
    const db = new Database(fixture.databasePath);
    try {
      for (let i = 1; i <= 4; i += 1) fixture.seedResearchJobs(11, i);
      const claims = Array.from({ length: 40 }, (_, index) =>
        claimNextJob(
          db,
          `load-worker-${index}`,
          fixture.clock.now(),
          "2099-01-01T00:00:00.000Z",
        ),
      );
      expect(claims.every((claim) => claim !== undefined)).toBe(true);
      expect(
        new Set(claims.slice(0, 4).map((claim) => claim?.runId)).size,
      ).toBe(4);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) n FROM jobs WHERE status = 'leased' GROUP BY run_id",
          )
          .all(),
      ).toEqual([{ n: 10 }, { n: 10 }, { n: 10 }, { n: 10 }]);
      expect(
        claimNextJob(
          db,
          "excess",
          fixture.clock.now(),
          "2099-01-01T00:00:00.000Z",
        ),
      ).toBeUndefined();
    } finally {
      db.close();
      fixture.cleanup();
    }
  });

  it("assigns four subscription runs and six API runs, then queues the eleventh", () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "1");
    vi.stubEnv(
      "STOCKSEMBLY_CODEX_API_AUTH_PATH",
      "/private/test-api-auth.json",
    );
    const fixture = new LeaseEngineFixture();
    const db = new Database(fixture.databasePath);
    try {
      const runs = Array.from({ length: 11 }, (_, i) =>
        fixture.seedResearchJob(i + 1),
      );
      for (let i = 0; i < 11; i += 1)
        activateNextRun(db, uuid(900000 + i), fixture.clock.now());
      expect(activeExecutionCounts(db)).toEqual({ subscription: 4, api: 6 });
      const claims = Array.from({ length: 10 }, (_, index) =>
        claimNextJob(
          db,
          `fair-worker-${index}`,
          fixture.clock.now(),
          "2099-01-01T00:00:00.000Z",
        ),
      );
      expect(new Set(claims.map((claim) => claim?.runId)).size).toBe(10);
      expect(claims.every((claim) => claim !== undefined)).toBe(true);
      const last = runs.at(-1);
      if (last === undefined) throw new Error("missing fixture run");
      expect(researchQueueStatus(db, last.runId)).toEqual({
        position: 1,
        activeRuns: 10,
        capacity: 10,
      });
      db.prepare("UPDATE runs SET status = 'cancelled' WHERE run_id = ?").run(
        runs[0]?.runId,
      );
      expect(activateNextRun(db, uuid(900050), fixture.clock.now())).toBe(true);
      expect(activeExecutionCounts(db)).toEqual({ subscription: 4, api: 6 });
      expect(researchQueueStatus(db, last.runId)).toBeUndefined();
    } finally {
      db.close();
      fixture.cleanup();
    }
  });

  it("keeps additional runs queued while API billing is disabled", () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    const fixture = new LeaseEngineFixture();
    const db = new Database(fixture.databasePath);
    try {
      for (let i = 1; i <= 5; i += 1) fixture.seedResearchJob(i);
      for (let i = 0; i < 5; i += 1)
        activateNextRun(db, uuid(900100 + i), fixture.clock.now());
      expect(activeExecutionCounts(db)).toEqual({ subscription: 4, api: 0 });
    } finally {
      db.close();
      fixture.cleanup();
    }
  });
});

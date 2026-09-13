import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeExecutionCounts,
  researchQueueStatus,
} from "../server/persistence/postgres/runExecutionRepository";
import { createLeaseEngineFixture, uuid } from "./leaseEngine.testSupport";
import { activateNextRun } from "./leaseEnginePostgresAdmission";
import { claimNextJob } from "./leaseEnginePostgresClaim";

afterEach(() => vi.unstubAllEnvs());

describe("durable research capacity", () => {
  it("leases ten jobs per subscription run fairly and leaves excess jobs queued", async () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    const fixture = await createLeaseEngineFixture();
    const db = fixture.pool;
    try {
      for (let i = 1; i <= 4; i += 1) await fixture.seedResearchJobs(11, i);
      const claims = [];
      for (let index = 0; index < 40; index += 1)
        claims.push(
          await claimNextJob(
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
        (
          await db.query(
            "SELECT COUNT(*)::integer n FROM jobs WHERE status='leased' GROUP BY run_id",
          )
        ).rows,
      ).toEqual([{ n: 10 }, { n: 10 }, { n: 10 }, { n: 10 }]);
      expect(
        await claimNextJob(
          db,
          "excess",
          fixture.clock.now(),
          "2099-01-01T00:00:00.000Z",
        ),
      ).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("assigns four subscription runs and six API runs, then queues the eleventh", async () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "1");
    vi.stubEnv(
      "STOCKSEMBLY_CODEX_API_AUTH_PATH",
      "/private/test-api-auth.json",
    );
    const fixture = await createLeaseEngineFixture();
    const db = fixture.pool;
    try {
      const runs = await Promise.all(
        Array.from(
          { length: 11 },
          async (_, i) => await fixture.seedResearchJob(i + 1),
        ),
      );
      for (let i = 0; i < 11; i += 1)
        await activateNextRun(db, uuid(900000 + i), fixture.clock.now());
      expect(await activeExecutionCounts(db)).toEqual({
        subscription: 4,
        api: 6,
      });
      const claims = await Promise.all(
        Array.from(
          { length: 10 },
          async (_, index) =>
            await claimNextJob(
              db,
              `fair-worker-${index}`,
              fixture.clock.now(),
              "2099-01-01T00:00:00.000Z",
            ),
        ),
      );
      expect(new Set(claims.map((claim) => claim?.runId)).size).toBe(10);
      expect(claims.every((claim) => claim !== undefined)).toBe(true);
      const last = runs.at(-1);
      if (last === undefined) throw new Error("missing fixture run");
      expect(await researchQueueStatus(db, last.runId)).toEqual({
        position: 1,
        activeRuns: 10,
        capacity: 10,
      });
      await db.query("UPDATE runs SET status = 'cancelled' WHERE run_id = $1", [
        runs[0]?.runId,
      ]);
      expect(await activateNextRun(db, uuid(900050), fixture.clock.now())).toBe(
        true,
      );
      expect(await activeExecutionCounts(db)).toEqual({
        subscription: 4,
        api: 6,
      });
      expect(await researchQueueStatus(db, last.runId)).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps additional runs queued while API billing is disabled", async () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    const fixture = await createLeaseEngineFixture();
    const db = fixture.pool;
    try {
      for (let i = 1; i <= 5; i += 1) await fixture.seedResearchJob(i);
      for (let i = 0; i < 5; i += 1)
        await activateNextRun(db, uuid(900100 + i), fixture.clock.now());
      expect(await activeExecutionCounts(db)).toEqual({
        subscription: 4,
        api: 0,
      });
    } finally {
      await fixture.cleanup();
    }
  });
});

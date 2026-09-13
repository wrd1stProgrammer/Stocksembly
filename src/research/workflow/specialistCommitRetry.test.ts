import { describe, expect, it } from "vitest";
import { openPostgresStore } from "../server/persistence/postgres/postgresStore";
import {
  createRunFixture,
  temporaryDatabase,
} from "../server/persistence/postgres/postgresStore.contractFixtures";
import {
  reserveEditorialQualityRewrite,
  retryRejectedCommit,
} from "./specialistCommitRetry";

describe("retryRejectedCommit", () => {
  it("retries a rejected specialist commit instead of losing a valid memo", async () => {
    let calls = 0;

    const result = await retryRejectedCommit(async () => {
      calls += 1;
      return calls === 1
        ? ({ kind: "rejected" } as const)
        : ({ kind: "committed", sequence: 12 } as const);
    });

    expect(result).toEqual({ kind: "committed", sequence: 12 });
    expect(calls).toBe(2);
  });

  it("replays one durable editorial rewrite across resume and consumes one shared replacement", async () => {
    const temporary = await temporaryDatabase();
    const store = await openPostgresStore(temporary.path);
    const run = createRunFixture(991);
    await store.createRun(run);
    const initial = await store.findRun(run.runId);
    await store.close();
    const reserve = async () =>
      await reserveEditorialQualityRewrite({
        database: temporary.path,
        runId: run.runId,
        inputHash: "a".repeat(64),
        now: "2026-07-31T00:00:00.000Z",
      });

    expect(await Promise.all([reserve(), reserve()])).toEqual([true, true]);
    expect(
      await reserveEditorialQualityRewrite({
        database: temporary.path,
        runId: run.runId,
        inputHash: "b".repeat(64),
        now: "2026-07-31T00:00:01.000Z",
      }),
    ).toBe(false);
    const database = temporary.path;
    const state = (
      await database.query(
        "SELECT requested_replacement_calls AS budget,\n      (SELECT COUNT(*)::integer FROM idempotency_records\n       WHERE scope = 'editorial-quality-rewrite') AS reservations\n      FROM runs WHERE run_id = $1",
        [run.runId],
      )
    ).rows[0];

    expect(state).toEqual({
      budget: initial!.requestedReplacementCalls - 1,
      reservations: 1,
    });
    await temporary.close();
  });
});

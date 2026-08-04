import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import {
  createRunFixture,
  temporaryDatabase,
} from "../server/persistence/sqlite/sqliteStore.contractFixtures";
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

  it("replays one durable editorial rewrite across resume and consumes one shared replacement", () => {
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const run = createRunFixture(991);
    store.createRun(run);
    store.close();
    const reserve = () =>
      reserveEditorialQualityRewrite({
        databasePath: temporary.path,
        runId: run.runId,
        inputHash: "a".repeat(64),
        now: "2026-07-31T00:00:00.000Z",
      });

    expect(reserve()).toBe(true);
    expect(reserve()).toBe(true);
    expect(
      reserveEditorialQualityRewrite({
        databasePath: temporary.path,
        runId: run.runId,
        inputHash: "b".repeat(64),
        now: "2026-07-31T00:00:01.000Z",
      }),
    ).toBe(false);
    const database = new Database(temporary.path, { readonly: true });
    const state = database
      .prepare(`SELECT requested_replacement_calls AS budget,
      (SELECT COUNT(*) FROM idempotency_records
       WHERE scope = 'editorial-quality-rewrite') AS reservations
      FROM runs WHERE run_id = ?`)
      .get(run.runId);
    database.close();
    expect(state).toEqual({ budget: 4, reservations: 1 });
    rmSync(temporary.directory, { recursive: true, force: true });
  });
});

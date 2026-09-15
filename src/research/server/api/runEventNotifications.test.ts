import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { workflowTestDatabase } from "../../workflow/postgresDatabase.testSupport";
import { RunEventNotifications } from "./runEventNotifications";
import { RunEventsSseRepository } from "./runEventsSseRepository";

it("delivers only committed wake-ups and reconnects after its LISTEN connection is lost", async () => {
  const database = await workflowTestDatabase();
  const invalidate = vi.fn();
  const notifications = new RunEventNotifications(database, invalidate);
  const runId = randomUUID();
  const watch = notifications.watch(runId);
  const other = notifications.watch(randomUUID());
  try {
    expect(await watch.wait(2_000, [])).toBe(true);
    expect(await other.wait(2_000, [])).toBe(true);
    const transaction = await database.connect();
    try {
      await transaction.query("BEGIN");
      await transaction.query(
        "SELECT pg_notify('stocksembly_run_events', $1)",
        [runId],
      );
      expect(await watch.wait(50, [])).toBe(false);
      await transaction.query("ROLLBACK");
      expect(await watch.wait(50, [])).toBe(false);
    } finally {
      transaction.release();
    }
    await database.query("SELECT pg_notify('stocksembly_run_events', $1)", [
      runId,
    ]);
    expect(await watch.wait(2_000, [])).toBe(true);
    expect(await other.wait(50, [])).toBe(false);
    expect(invalidate).toHaveBeenCalledWith(runId);

    const listeners = await database.query(
      "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND query = 'LISTEN stocksembly_run_events'",
    );
    expect(listeners.rows).toHaveLength(1);
    await database.query("SELECT pg_terminate_backend($1)", [
      listeners.rows[0]?.pid,
    ]);
    expect(await watch.wait(4_000, [])).toBe(true);
    await database.query("SELECT pg_notify('stocksembly_run_events', $1)", [
      runId,
    ]);
    expect(await watch.wait(2_000, [])).toBe(true);
  } finally {
    watch.close();
    other.close();
    notifications.close();
  }
});

it("shares identical reads but separates principals and invalidates on a new event", async () => {
  const database = await workflowTestDatabase();
  const repository = new RunEventsSseRepository({ database });
  const connect = vi.spyOn(database, "connect");
  const runId = randomUUID();
  try {
    await Promise.all(
      Array.from({ length: 20 }, () => repository.snapshot("owner", runId, 0)),
    );
    expect(connect).toHaveBeenCalledTimes(1);
    await repository.snapshot("another-owner", runId, 0);
    expect(connect).toHaveBeenCalledTimes(2);
    repository.invalidate(runId);
    await repository.snapshot("owner", runId, 0);
    expect(connect).toHaveBeenCalledTimes(3);
  } finally {
    connect.mockRestore();
    repository.close();
  }
});

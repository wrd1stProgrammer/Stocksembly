import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import { PostgresAccountStore } from "./postgresAccountStore";

it("opens a paid report immediately after debit, permits rereads and rejects unaffordable new reports", async () => {
  const fixture = await createResearchTestDatabase();
  const store = await PostgresAccountStore.create({
    ...fixture.pool.options,
    options: "-c search_path=public,pg_catalog",
  });
  const id = "b".repeat(64);
  const reportId = randomUUID();
  const eventKey = `research-room:${id}:${reportId}`;
  try {
    await store.syncUser({ kind: "local", id }, new Date().toISOString());
    expect(
      await store.consumeResearchRoomCredit(id, eventKey, reportId, true),
    ).toEqual({ allowed: true, remaining: 5, required: 3 });
    expect(
      await store.consumeResearchRoomCredit(id, eventKey, reportId),
    ).toEqual({ allowed: true, remaining: 2, required: 3 });
    expect(
      await store.consumeResearchRoomCredit(id, eventKey, reportId),
    ).toEqual({ allowed: true, remaining: 2, required: 0 });
    expect(
      await store.consumeResearchRoomCredit(id, eventKey, reportId, true),
    ).toEqual({ allowed: true, remaining: 2, required: 0 });
    const otherReportId = randomUUID();
    expect(
      await store.consumeResearchRoomCredit(
        id,
        `research-room:${id}:${otherReportId}`,
        otherReportId,
      ),
    ).toEqual({ allowed: false, remaining: 2, required: 3 });
    const debits = await fixture.pool.query(
      "SELECT quantity FROM public.usage_events WHERE principal_id = $1 AND kind = 'research_room'",
      [id],
    );
    expect(debits.rows).toEqual([{ quantity: 3 }]);
  } finally {
    await store.close();
    await fixture.close();
  }
});

it("preserves verified reads and owned reports without charging again, but not another user's access", async () => {
  const fixture = await createResearchTestDatabase();
  const store = await PostgresAccountStore.create({
    ...fixture.pool.options,
    options: "-c search_path=public,pg_catalog",
  });
  const id = "c".repeat(64);
  const otherId = "d".repeat(64);
  const readReportId = randomUUID();
  const ownedReportId = randomUUID();
  const otherReportId = randomUUID();
  const runId = randomUUID();
  const credit = (reportId: string, checkOnly: boolean) =>
    store.consumeResearchRoomCredit(
      id,
      `research-room:${id}:${reportId}`,
      reportId,
      checkOnly,
    );
  try {
    await store.syncUser({ kind: "local", id }, new Date().toISOString());
    await store.syncUser(
      { kind: "local", id: otherId },
      new Date().toISOString(),
    );
    await store.recordReportRead(id, readReportId);
    await store.recordReportRead(otherId, otherReportId);
    await fixture.pool.query(
      `INSERT INTO public.research_run_ownership
       (run_id, principal_id, symbol, locale, status, created_at, recorded_at)
       VALUES ($1, $2, 'MSTR', 'ko', 'completed', now(), now())`,
      [runId, id],
    );
    await fixture.pool.query(
      `INSERT INTO public.report_ownership
       (report_id, run_id, principal_id, version_id, version, status, published_at, recorded_at)
       VALUES ($1, $2, $3, $4, 1, 'complete', now(), now())`,
      [ownedReportId, runId, id, randomUUID()],
    );
    expect(await store.listReadResearchReportIds(id)).toContain(readReportId);
    for (const reportId of [readReportId, ownedReportId]) {
      expect(await credit(reportId, true)).toEqual({
        allowed: true,
        remaining: 5,
        required: 0,
      });
      expect(await credit(reportId, false)).toEqual({
        allowed: true,
        remaining: 5,
        required: 0,
      });
    }
    expect(await credit(otherReportId, true)).toEqual({
      allowed: true,
      remaining: 5,
      required: 3,
    });
    expect(await credit(otherReportId, false)).toEqual({
      allowed: true,
      remaining: 2,
      required: 3,
    });
    expect(await credit(readReportId, true)).toEqual({
      allowed: true,
      remaining: 2,
      required: 0,
    });
    expect(await credit(ownedReportId, false)).toEqual({
      allowed: true,
      remaining: 2,
      required: 0,
    });
    const debits = await fixture.pool.query(
      "SELECT report_id, quantity FROM public.usage_events WHERE principal_id = $1 AND kind = 'research_room'",
      [id],
    );
    expect(debits.rows).toEqual([{ report_id: otherReportId, quantity: 3 }]);
  } finally {
    await store.close();
    await fixture.close();
  }
});

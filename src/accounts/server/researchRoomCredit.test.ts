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

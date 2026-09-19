import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { parseAdminAnalyticsQuery } from "../../admin/analyticsContracts";
import { queryAdminOverview } from "../../admin/server/postgresAdminAnalytics";
import { waitForStockPreparation } from "../../research/server/persistence/postgres/stockPreparation";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import { PostgresAccountStore } from "./postgresAccountStore";

it("records free reads without entitlement, deduplicates engagement and rejects expired preparation", async () => {
  const fixture = await createResearchTestDatabase();
  const store = await PostgresAccountStore.create({
    ...fixture.pool.options,
    options: "-c search_path=public,pg_catalog",
  });
  const id = "a".repeat(64);
  const reportId = randomUUID();
  try {
    await store.syncUser({ kind: "local", id }, new Date().toISOString());
    await Promise.all([
      store.recordReportRead(id, reportId),
      store.recordReportRead(id, reportId),
    ]);
    expect(await store.listReadResearchReportIds(id)).toEqual([reportId]);
    expect(
      (
        await fixture.pool.query(
          "SELECT * FROM public.usage_events WHERE kind='research_room'",
        )
      ).rowCount,
    ).toBe(0);
    const input = {
      eventId: randomUUID(),
      sessionId: randomUUID(),
      surface: "landing" as const,
      kind: "page" as const,
      startedAt: new Date(Date.now() - 10000).toISOString(),
      endedAt: new Date().toISOString(),
      visibleMs: 5000,
    };
    await store.recordProductEngagement(id, input);
    await store.recordProductEngagement(id, { ...input, visibleMs: 3000 });
    expect(
      (
        await fixture.pool.query(
          "SELECT visible_ms FROM public.product_engagement",
        )
      ).rows[0].visible_ms,
    ).toBe(5000);
    await fixture.pool.query(
      "INSERT INTO stock_preparations(symbol, status, expires_at) VALUES('NVDA', 'ready', now()-interval '1 second')",
    );
    expect(
      await waitForStockPreparation({
        database: fixture.pool,
        symbol: "NVDA",
        signal: new AbortController().signal,
        activity: () => {},
        onWaiting: async () => {},
      }),
    ).toBe("fallback");
    const accountPool = new (await import("pg")).Pool({
      ...fixture.pool.options,
      options: "-c search_path=public,pg_catalog",
    });
    try {
      const summary = await queryAdminOverview(
        accountPool,
        parseAdminAnalyticsQuery(new URLSearchParams("range=7")),
      );
      expect(summary.engagement).toEqual([
        expect.objectContaining({
          surface: "landing",
          visits: 1,
          visibleSeconds: 5,
        }),
      ]);
    } finally {
      await accountPool.end();
    }
  } finally {
    await store.close();
    await fixture.close();
  }
});

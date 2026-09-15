import { expect, it } from "vitest";
import { saveOnboardingInterests } from "../../research/server/persistence/postgres/stockPreparation";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import { OnboardingStockSchema } from "../onboardingInterests";
import { PostgresAccountStore } from "./postgresAccountStore";

it("links interests on paid access exactly once without replacing existing watchlist items", async () => {
  const fixture = await createResearchTestDatabase();
  const store = await PostgresAccountStore.create({
    ...fixture.pool.options,
    options: "-c search_path=public,pg_catalog",
  });
  const id = "a".repeat(64);
  const stock = (symbol: string) =>
    OnboardingStockSchema.parse({
      symbol,
      providerCode: `NASDAQ:${symbol}`,
      company: symbol,
      exchange: "NASDAQ",
    });
  try {
    await store.syncUser({ kind: "local", id }, new Date().toISOString());
    await saveOnboardingInterests(fixture.pool, id, [
      stock("NVDA"),
      stock("AAPL"),
      stock("MSFT"),
    ]);
    await store.linkOnboardingWatchlist(id);
    expect(await store.listBriefingWatchlist(id)).toHaveLength(0);
    await fixture.pool.query(
      "UPDATE public.entitlements SET plan_code='pro',status='active' WHERE principal_id=$1",
      [id],
    );
    await store.addBriefingWatchlistItem(id, {
      ...stock("GOOG"),
      exchange: "NASDAQ",
    });
    await store.linkOnboardingWatchlist(id);
    expect(
      (await store.listBriefingWatchlist(id)).map((item) => item.symbol),
    ).toEqual(["GOOG", "NVDA", "AAPL"]);
    await store.removeBriefingWatchlistItem(id, "NVDA");
    await store.linkOnboardingWatchlist(id);
    expect(
      (await store.listBriefingWatchlist(id)).map((item) => item.symbol),
    ).toEqual(["GOOG", "AAPL"]);
  } finally {
    await store.close();
    await fixture.close();
  }
});

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OnboardingStockSchema,
  OnboardingSymbolsSchema,
} from "../../../../accounts/onboardingInterests";
import { createResearchTestDatabase } from "../../../../test/researchPostgres";
import {
  claimStockPreparation,
  finishStockPreparation,
  saveOnboardingInterests,
  waitForStockPreparation,
} from "./stockPreparation";

let fixture: Awaited<ReturnType<typeof createResearchTestDatabase>>;
let database: Pool;
beforeEach(async () => {
  fixture = await createResearchTestDatabase();
  database = fixture.pool;
  await database.query(`CREATE TABLE public.app_users(principal_id text PRIMARY KEY);
    CREATE TABLE public.onboarding_interests(principal_id text PRIMARY KEY REFERENCES public.app_users,stocks jsonb NOT NULL);
    INSERT INTO public.app_users VALUES ('a'),('b');`);
});
afterEach(async () => {
  await fixture?.close();
});
const stock = (symbol: string) =>
  OnboardingStockSchema.parse({
    symbol,
    providerCode: `NASDAQ:${symbol}`,
    company: symbol,
    exchange: "NASDAQ",
  });
describe("onboarding preparation", () => {
  it("rejects missing, duplicated and more than three symbols", () => {
    for (const symbols of [
      [],
      ["NVDA", "NVDA"],
      ["NVDA", "AAPL", "MSFT", "GOOG"],
    ])
      expect(OnboardingSymbolsSchema.safeParse(symbols).success).toBe(false);
    expect(OnboardingSymbolsSchema.parse(["nvda"])).toEqual(["NVDA"]);
  });
  it("atomically deduplicates users and repeated Next clicks with a one-time budget", async () => {
    await Promise.all([
      saveOnboardingInterests(database, "a", [stock("NVDA")]),
      saveOnboardingInterests(database, "b", [stock("NVDA")]),
    ]);
    expect(
      (await database.query("SELECT symbol FROM stock_preparations")).rows,
    ).toEqual([{ symbol: "NVDA" }]);
    expect(
      await saveOnboardingInterests(database, "a", [stock("AAPL")]),
    ).toEqual([stock("NVDA")]);
    const claims = await Promise.all([
      claimStockPreparation(database),
      claimStockPreparation(database),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("waits for the existing work and ignores completion from an obsolete lease", async () => {
    await saveOnboardingInterests(database, "a", [stock("NVDA")]);
    const claim = (await claimStockPreparation(database))!;
    await finishStockPreparation(database, "NVDA", randomUUID(), true);
    expect(
      (await database.query("SELECT status FROM stock_preparations")).rows[0]
        .status,
    ).toBe("running");
    let waiting = 0;
    const result = waitForStockPreparation({
      database,
      symbol: "NVDA",
      signal: new AbortController().signal,
      activity: () => undefined,
      onWaiting: async () => {
        waiting++;
        await finishStockPreparation(database, "NVDA", claim.lease_token, true);
      },
      pollMs: 5,
    });
    expect(await result).toBe("ready");
    expect(waiting).toBe(1);
  });
  it("falls back for queued/stale jobs and honours cancellation without indefinite waits", async () => {
    await saveOnboardingInterests(database, "a", [stock("NVDA")]);
    const input = {
      database,
      symbol: "NVDA",
      signal: new AbortController().signal,
      activity: () => undefined,
      onWaiting: async () => undefined,
      pollMs: 5,
    };
    expect(await waitForStockPreparation(input)).toBe("fallback");
    await database.query(
      "UPDATE stock_preparations SET status='running',lease_until=now()-interval '1 second'",
    );
    expect(await waitForStockPreparation(input)).toBe("fallback");
    await database.query(
      "UPDATE stock_preparations SET lease_until=now()+interval '1 minute'",
    );
    expect(await waitForStockPreparation({ ...input, maxWaitMs: 0 })).toBe(
      "fallback",
    );
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      waitForStockPreparation({ ...input, signal: aborted.signal }),
    ).rejects.toThrow();
  });
  it("recovers expired leases and bounds retry attempts", async () => {
    await saveOnboardingInterests(database, "a", [stock("NVDA")]);
    const first = (await claimStockPreparation(database))!;
    await database.query(
      "UPDATE stock_preparations SET lease_until=now()-interval '1 second'",
    );
    const second = (await claimStockPreparation(database))!;
    expect(second.lease_token).not.toBe(first.lease_token);
    await finishStockPreparation(database, "NVDA", second.lease_token, false);
    expect(
      (await database.query("SELECT status FROM stock_preparations")).rows[0]
        .status,
    ).toBe("failed");
    expect(await claimStockPreparation(database)).toBeUndefined();
  });
});

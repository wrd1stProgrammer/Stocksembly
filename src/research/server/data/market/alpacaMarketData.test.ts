import { describe, expect, it } from "vitest";
import {
  collectAlpacaDailyBars,
  deriveTechnicalSnapshot,
  type MarketBar,
} from "./alpacaMarketData";

function bars(count = 260): MarketBar[] {
  return Array.from({ length: count }, (_, index) => ({
    t: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    o: 100 + index,
    h: 102 + index,
    l: 99 + index,
    c: 101 + index,
    v: 1_000 + index,
  }));
}

describe("Alpaca market data", () => {
  it("derives trend, momentum, volatility, and volume measures", () => {
    const result = deriveTechnicalSnapshot(bars());
    expect(result.barCount).toBe(260);
    expect(result.sma200).toBeDefined();
    expect(result.rsi14).toBe(100);
    expect(result.macd).toBeDefined();
    expect(result.atr14).toBeDefined();
    expect(result.volumeRatio20).toBeDefined();
    expect(result.return252d).toBeGreaterThan(0);
  });

  it("does not call the provider without configured credentials", async () => {
    let called = false;
    const result = await collectAlpacaDailyBars({
      symbol: "NVDA",
      transport: async () => {
        called = true;
        return { status: 500, body: "" };
      },
    });
    expect(result).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(called).toBe(false);
  });
});

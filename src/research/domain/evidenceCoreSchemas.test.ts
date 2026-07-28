import { describe, expect, it } from "vitest";
import { SourceLocatorSchema } from "./evidenceCoreSchemas";

describe("SEC source locator", () => {
  it("accepts an SEC filing date alongside its timezone-aware acceptance timestamp", () => {
    // Given
    const locator = {
      kind: "sec_filing",
      source: "sec_primary_filing",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/2488/000000248826000018/amd-20251227.htm",
      accession: "0000002488-26-000018",
      form: "10-K",
      filedAt: "2026-02-04T00:00:00.000Z",
      acceptedAt: "2026-02-03T23:14:52.000Z",
      periodEnd: "2025-12-27",
      unit: "text",
    };

    // When
    const parsed = SourceLocatorSchema.safeParse(locator);

    // Then
    expect(parsed.success).toBe(true);
  });

  it.each([
    {
      kind: "licensed_provider",
      source: "insightsentry_rapidapi",
      sourceUrl: "https://insightsentry.p.rapidapi.com/stock/v3/ohlcv",
      endpoint: "stock/v3/ohlcv",
      symbol: "NASDAQ:NVDA",
      dataset: "market_bars",
      unit: "USD",
    },
    {
      kind: "captured_web",
      source: "captured_web",
      sourceUrl: "https://example.com/research/nvda",
      publisher: "Example Research",
      title: "NVDA research",
    },
  ])("accepts registered $source evidence", (locator) => {
    expect(SourceLocatorSchema.safeParse(locator).success).toBe(true);
  });
});

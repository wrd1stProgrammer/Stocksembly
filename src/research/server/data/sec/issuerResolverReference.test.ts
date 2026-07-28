import { describe, expect, it } from "vitest";
import { searchTickerReference } from "./issuerResolverReference";

const reference = new TextEncoder().encode(
  JSON.stringify({
    fields: ["cik", "name", "ticker", "exchange"],
    data: [
      [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
      [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
      [1326801, "Meta Platforms, Inc.", "META", "Nasdaq"],
      [884394, "SPDR S&P 500 ETF TRUST", "SPY", "NYSE"],
      [1, "OTC Issuer", "OTCX", "OTC"],
    ],
  }),
);

describe("SEC ticker catalog search", () => {
  it("finds a listed company by symbol or company name", () => {
    // Given / When
    const symbolResults = searchTickerReference(reference, "brk-b");
    const companyResults = searchTickerReference(reference, "meta platforms");

    // Then
    expect(symbolResults).toEqual([
      {
        cik: "0001067983",
        symbol: "BRK-B",
        company: "BERKSHIRE HATHAWAY INC",
        exchange: "NYSE",
      },
    ]);
    expect(companyResults.map((result) => result.symbol)).toEqual(["META"]);
  });

  it("excludes unsupported exchanges and explicitly unsupported ETFs", () => {
    // Given / When
    const otcResults = searchTickerReference(reference, "OTCX");
    const etfResults = searchTickerReference(reference, "SPY");

    // Then
    expect(otcResults).toEqual([]);
    expect(etfResults).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { filterTickers } from "./tickers";

describe("filterTickers", () => {
  it("returns a symbol match when the query is a ticker", () => {
    // Given
    const query = "nvda";

    // When
    const results = filterTickers(query);

    // Then
    expect(results.map(({ symbol }) => symbol)).toEqual(["NVDA"]);
  });

  it("returns a company match when the query is a company name", () => {
    // Given
    const query = "apple";

    // When
    const results = filterTickers(query);

    // Then
    expect(results.map(({ symbol }) => symbol)).toEqual(["AAPL"]);
  });

  it("returns no results for an unsupported ticker", () => {
    // Given
    const query = "ZZZZ";

    // When
    const results = filterTickers(query);

    // Then
    expect(results).toEqual([]);
  });
});

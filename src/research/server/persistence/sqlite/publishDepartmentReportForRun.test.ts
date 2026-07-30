import { expect, it } from "vitest";
import { parseDepartmentMarketSnapshot } from "./publishDepartmentReportForRun";

it("restores the observed price from sealed department quote evidence", () => {
  const snapshot = parseDepartmentMarketSnapshot(
    {
      kind: "licensed_provider",
      source: "insightsentry_rapidapi",
      dataset: "insightsentry_quote",
    },
    JSON.stringify({
      providerCode: "NASDAQ:TSLA",
      marketState: "PRE",
      observedAt: "2026-07-30T10:34:51.000Z",
      lastPrice: 302.75,
      currency: "USD",
    }),
  );

  expect(snapshot).toEqual({
    providerCode: "NASDAQ:TSLA",
    marketState: "PRE",
    observedAt: "2026-07-30T10:34:51.000Z",
    lastPrice: 302.75,
    currency: "USD",
  });
});

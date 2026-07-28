import { describe, expect, it } from "vitest";
import { latestAnnualRevenueValue } from "./officialScenarioValue";

describe("latestAnnualRevenueValue", () => {
  it("selects the latest annual SEC revenue rather than a quarterly observation", () => {
    expect(
      latestAnnualRevenueValue(
        JSON.stringify({
          value: {
            selectedFacts: [
              {
                metric: "revenue",
                value: "81615000000",
                end: "2026-04-26",
                filedAt: "2026-05-20T00:00:00.000Z",
                periodKind: "quarter",
              },
              {
                metric: "revenue",
                value: "215938000000",
                end: "2026-01-25",
                filedAt: "2026-02-25T00:00:00.000Z",
                periodKind: "annual",
              },
            ],
          },
        }),
      ),
    ).toBe("215938000000");
  });
});

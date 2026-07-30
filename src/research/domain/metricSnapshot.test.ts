import { describe, expect, it } from "vitest";
import { buildResearchMetricSnapshot } from "./metricSnapshot";

describe("research metric snapshot", () => {
  it("preserves price, fundamentals, and nested segment mix", () => {
    const snapshot = buildResearchMetricSnapshot({
      asOf: "2026-07-31T00:00:00.000Z",
      quote: {
        providerCode: "NVDA",
        lastPrice: 182.45,
        currency: "USD",
        observedAt: "2026-07-30T20:00:00.000Z",
      },
      fundamentals: {
        providerUpdatedAt: "2026-07-30T00:00:00.000Z",
        indicators: [
          { id: "revenue_one_year_growth_ttm", value: 65.5, period: "TTM" },
          {
            id: "revenue_seg_by_business_h",
            value: [
              {
                date: 2026,
                segments: [
                  { label: "Data Center", value: 100 },
                  { label: "Gaming", value: 25 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(snapshot?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "current_price", value: 182.45 }),
        expect.objectContaining({ id: "revenue_growth", value: 65.5 }),
        expect.objectContaining({
          id: "segment_share:data_center",
          value: 80,
        }),
      ]),
    );
  });
});

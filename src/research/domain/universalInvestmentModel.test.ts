import { describe, expect, it } from "vitest";
import type { ResearchMetricPoint } from "./metricSnapshot";
import { buildUniversalInvestmentModel } from "./universalInvestmentModel";

const observedAt = "2026-08-10T00:00:00.000Z";

function point(
  id: string,
  value: number,
  unit: ResearchMetricPoint["unit"] = "multiple",
): ResearchMetricPoint {
  return {
    id,
    label: { en: id, ko: id },
    category: "financial",
    value,
    unit,
    observedAt,
    source: "insightsentry",
    signal: "contextual",
  };
}

describe("universal investment model", () => {
  it("routes financial institutions through book value rather than a generic P/E", () => {
    const model = buildUniversalInvestmentModel({
      sector: "Financial Services / Banks",
      metrics: [
        point("current_price", 200, "USD_per_share"),
        point("book_value_per_share", 110, "USD_per_share"),
        point("roe", 15, "percent"),
        point("forward_eps", 18, "USD_per_share"),
      ],
    });

    expect(model.archetype).toBe("financial_institution");
    expect(model.primaryMethod).toBe("book_value");
    expect(model.scenarios).toHaveLength(3);
    expect(model.scenarios[1]?.requiredMetric.en).toBe("Price / book");
  });

  it("recognizes a bank from its statement structure when sector metadata is absent", () => {
    const model = buildUniversalInvestmentModel({
      metrics: [
        point("current_price", 200, "USD_per_share"),
        point("revenue_ttm", 100, "USD"),
        point("total_assets", 1_200, "USD"),
        point("operating_cash_flow", 40, "USD"),
        point("free_cash_flow", 40, "USD"),
        point("capital_expenditures", 0, "USD"),
        point("book_value_per_share", 100, "USD_per_share"),
        point("roe", 16, "percent"),
      ],
    });

    expect(model.archetype).toBe("financial_institution");
    expect(model.primaryMethod).toBe("book_value");
    expect(model.freeCashFlowYieldPercent).toBeUndefined();
  });

  it("routes cyclical companies through an EV/EBITDA sensitivity", () => {
    const model = buildUniversalInvestmentModel({
      sector: "Energy",
      metrics: [
        point("current_price", 100, "USD_per_share"),
        point("ev_ebitda", 8),
        point("forward_eps", 9, "USD_per_share"),
      ],
    });

    expect(model.archetype).toBe("cyclical");
    expect(model.primaryMethod).toBe("ev_ebitda");
    expect(model.scenarios[0]?.requiredMetric.en).toBe("EV / EBITDA");
  });

  it("routes high-multiple growth companies through revenue sensitivity", () => {
    const model = buildUniversalInvestmentModel({
      metrics: [
        point("current_price", 170, "USD_per_share"),
        point("market_cap", 400_000_000_000, "USD"),
        point("net_debt", -4_000_000_000, "USD"),
        point("revenue_ttm", 5_000_000_000, "USD"),
        point("forward_revenue", 7_000_000_000, "USD"),
        point("ev_revenue", 30),
        point("forward_pe", 90),
        point("forward_eps", 1.9, "USD_per_share"),
        point("free_cash_flow", 1_000_000_000, "USD"),
      ],
    });

    expect(model.archetype).toBe("growth");
    expect(model.primaryMethod).toBe("revenue_multiple");
    expect(model.scenarios[1]?.requiredMetric.en).toBe("EV/Revenue");
  });

  it("does not manufacture an earnings price range from growth and current P/E", () => {
    const model = buildUniversalInvestmentModel({
      metrics: [
        point("current_price", 300, "USD_per_share"),
        point("forward_eps", 10, "USD_per_share"),
        point("eps_ttm", 8, "USD_per_share"),
        point("free_cash_flow", 20_000_000_000, "USD"),
      ],
    });

    expect(model.primaryMethod).toBe("earnings_power");
    expect(model.scenarios).toHaveLength(1);
    expect(model.scenarios[0]).toMatchObject({
      id: "base",
      requiredMetric: { en: "Current implied forward P/E" },
      requiredValue: 30,
    });
    expect(model.scenarios[0]?.impliedPrice).toBeUndefined();
    expect(model.summary.en).toContain("withheld");
  });

  it("withholds a synthetic target when no valuation anchor is available", () => {
    const model = buildUniversalInvestmentModel({
      metrics: [point("current_price", 12, "USD_per_share")],
    });

    expect(model.primaryMethod).toBe("expectation_bridge");
    expect(model.scenarios).toHaveLength(1);
    expect(model.scenarios[0]?.impliedPrice).toBeUndefined();
  });
});

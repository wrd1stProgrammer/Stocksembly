import { describe, expect, it } from "vitest";
import { buildResearchMetricSnapshot } from "../../../research/domain/metricSnapshot";
import { selectFinancialDiagnostics } from "./FinancialReportModel";

describe("financial diagnostic period integrity", () => {
  it("withholds FQ/TTM ratios and preserves the basis of each metric", () => {
    const metricSnapshot = buildResearchMetricSnapshot({
      asOf: "2026-09-06T00:00:00.000Z",
      fundamentals: {
        providerUpdatedAt: "2026-09-05T00:00:00.000Z",
        indicators: [
          { id: "total_revenue_ttm", value: 100 },
          { id: "free_cash_flow_ttm", value: 20 },
          { id: "capital_expenditures_fq", value: -3 },
          { id: "gross_margin_ttm", value: 74 },
          { id: "operating_margin_fq", value: 66 },
        ],
      },
    });
    expect(metricSnapshot).toBeDefined();
    if (metricSnapshot === undefined) throw new Error("snapshot missing");
    expect(
      metricSnapshot.metrics.find(
        (metric) => metric.id === "capital_expenditures",
      ),
    ).toMatchObject({ value: 3, period: "FQ" });
    const diagnostics = selectFinancialDiagnostics({ metricSnapshot });
    expect(diagnostics.map((metric) => metric.id)).not.toContain(
      "capital-intensity",
    );
    expect(diagnostics.map((metric) => metric.id)).not.toContain(
      "operating-capture",
    );
    expect(
      diagnostics.find((metric) => metric.id === "free-cash-flow-margin")
        ?.value,
    ).toBe(20);
  });
});

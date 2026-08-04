import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixtureData } from "../../../research/compositions/fixture";
import type { ResearchFileData } from "../../../research/compositions/types";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { teamReportPreviewFixture } from "../../../research/teamReportPreviewFixture";
import { CompletedResearchFile } from "../CompletedResearchFile";
import {
  selectAlignedFinancialPeriods,
  selectAuditableValuation,
} from "./FinancialReportModel";
import { rankStructuredRisks } from "./RiskReportModel";

const company = fixtureData.createCompany(
  "NVDA",
  "NVIDIA Corporation",
  "NASDAQ",
  "Semiconductors",
);

function renderReport(report: ResearchFileData) {
  return render(
    <CompletedResearchFile
      company={company}
      report={report}
      locale="en"
      version={2}
      reportId="report-fixture"
      onReplay={vi.fn()}
    />,
  );
}

describe("financial and risk analytical products", () => {
  it("uses different landmark orders and renders an aligned multi-period financial bridge", () => {
    const financial = renderReport(teamReportPreviewFixture("financial"));
    expect(
      Array.from(
        financial.container.querySelectorAll("[data-report-section]"),
      ).map((section) => section.getAttribute("data-report-section")),
    ).toEqual([
      "cover",
      "decision",
      "expectations",
      "team-roundtable",
      "team-decision-board",
      "anticipated-qa",
      "sources",
    ]);
    expect(
      financial.container.querySelectorAll("[data-financial-period]"),
    ).toHaveLength(3);
    expect(
      financial.container.querySelector("[data-financial-metric-ids]"),
    ).toHaveAttribute(
      "data-financial-metric-ids",
      "revenue_ttm,gross_margin,operating_margin,free_cash_flow,capital_expenditures",
    );
    expect(
      financial.getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute(
      "href",
      "/api/research/reports/report-fixture/pdf?lang=en",
    );
    financial.unmount();

    const risk = renderReport(teamReportPreviewFixture("risk"));
    expect(
      Array.from(risk.container.querySelectorAll("[data-report-section]")).map(
        (section) => section.getAttribute("data-report-section"),
      ),
    ).toEqual([
      "cover",
      "decision",
      "escalation",
      "team-roundtable",
      "team-decision-board",
      "anticipated-qa",
      "sources",
    ]);
  });

  it.each(["financial", "risk"] as const)(
    "does not repeat the direct answer in the %s review module",
    (department) => {
      const report = teamReportPreviewFixture(department);
      const rendered = renderReport(report);
      const directAnswer = buildResearchFileEditorialModel(report, "en").directAnswer;
      expect(rendered.container.textContent?.split(directAnswer)).toHaveLength(2);
    },
  );

  it("ranks risk by structured impact and observability rather than array order", () => {
    const report = teamReportPreviewFixture("risk");
    if (report.structuredEditorial === undefined)
      throw new TypeError("risk fixture must have structured claims");
    const claims = report.structuredEditorial.claims;
    const reversed = {
      ...report,
      structuredEditorial: {
        ...report.structuredEditorial,
        claims: [...claims].reverse(),
      },
    };
    const original = renderReport(report);
    const originalIds = Array.from(
      original.container.querySelectorAll(
        "[data-risk-heatmap] [data-risk-claim-id]",
      ),
    ).map((row) => row.getAttribute("data-risk-claim-id"));
    original.unmount();
    const reordered = renderReport(reversed);
    const reorderedIds = Array.from(
      reordered.container.querySelectorAll(
        "[data-risk-heatmap] [data-risk-claim-id]",
      ),
    ).map((row) => row.getAttribute("data-risk-claim-id"));
    expect(originalIds.length).toBeGreaterThanOrEqual(2);
    expect(reorderedIds).toEqual(originalIds);
    expect(
      reordered.container.querySelectorAll(
        "[data-risk-impact][data-risk-observability]",
      ),
    ).toHaveLength(originalIds.length);
  });

  it("omits unsupported financial and risk graphics without blank target or range frames", () => {
    const financialReport = teamReportPreviewFixture("financial");
    const financial = renderReport({
      ...financialReport,
      metricSnapshot: {
        asOf:
          financialReport.metricSnapshot?.asOf ?? "2026-07-30T16:00:00.000Z",
        metrics: [],
      },
    });
    expect(
      financial.container.querySelector("[data-financial-bridge]"),
    ).toBeNull();
    expect(
      financial.container.querySelector("[data-valuation-comparison]"),
    ).toBeNull();
    expect(financial.container.querySelector("[data-price-target]")).toBeNull();
    expect(financial.container.querySelector("[data-value-range]")).toBeNull();
    expect(
      financial.container.querySelector(".research-visual-empty"),
    ).toBeNull();
    financial.unmount();

    const riskReport = teamReportPreviewFixture("risk");
    const { structuredEditorial: _structuredEditorial, ...riskWithoutClaims } =
      riskReport;
    const risk = renderReport(riskWithoutClaims);
    expect(risk.container.querySelector("[data-risk-heatmap]")).toBeNull();
    expect(risk.container.querySelector("[data-drawdown-range]")).toBeNull();
    expect(risk.container.querySelector(".research-visual-empty")).toBeNull();
  });

  it("fails closed for malformed periods, unsupported valuation, and stale structured risk state", () => {
    const report = teamReportPreviewFixture("financial");
    if (report.metricSnapshot === undefined)
      throw new TypeError("financial fixture must have metrics");
    const unaligned = {
      ...report,
      metricSnapshot: {
        ...report.metricSnapshot,
        metrics: report.metricSnapshot.metrics
          .filter(
            (metric) =>
              !(metric.id === "gross_margin" && metric.period === "FY2025"),
          )
          .map((metric) =>
            metric.id === "gross_margin" && metric.period === "FY2024"
              ? { ...metric, period: "not-a-period" }
              : metric,
          ),
      },
    };
    expect(selectAlignedFinancialPeriods(unaligned)).toEqual([]);
    expect(
      selectAuditableValuation({
        status: "no_qualified_comparison",
        rawPeerArtifactId: "S04",
        rawArtifactCount: 1,
        rows: [],
        displayGroups: [],
        valuation: {
          status: "not_eligible",
          reason: "insufficient_eligible_companies",
          eligibleCompanyCount: 1,
        },
      }),
    ).toBeUndefined();
    expect(rankStructuredRisks({}, "en")).toEqual([]);
  });
});

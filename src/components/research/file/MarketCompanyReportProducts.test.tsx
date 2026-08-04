import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import type { ResearchFileData } from "../../../research/compositions/types";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { teamReportPreviewFixture } from "../../../research/teamReportPreviewFixture";
import {
  CompanyReportBrief,
  CompanyReportFramework,
} from "./CompanyReportBody";
import { MarketReportBrief, MarketReportFramework } from "./MarketReportBody";
import { ResearchFileHeader } from "./ResearchFileHeader";

function bodies(department: "market" | "company", file: ResearchFileData) {
  const model = buildResearchFileEditorialModel(file, "en");
  return department === "market" ? (
    <>
      <MarketReportBrief file={file} model={model} locale="en" />
      <MarketReportFramework file={file} model={model} locale="en" />
    </>
  ) : (
    <>
      <CompanyReportBrief file={file} model={model} locale="en" />
      <CompanyReportFramework file={file} model={model} locale="en" />
    </>
  );
}

describe("market and company analytical products", () => {
  it("preserves default header navigation and committee cockpit behavior without an override", () => {
    const file = teamReportPreviewFixture("market");
    const model = buildResearchFileEditorialModel(file, "en");
    const result = render(
      <ResearchFileHeader
        company={{
          symbol: "NVDA",
          company: "NVIDIA",
          exchange: "NASDAQ",
          sector: "Technology",
          price: "172.41",
          change: "+1.8%",
          marketStatus: { en: "Open", ko: "장중" },
        }}
        file={file}
        model={model}
        locale="en"
        version={2}
        theme="light"
        onThemeChange={() => undefined}
        titleRef={createRef<HTMLHeadingElement>()}
        decisionCockpit
      />,
    );
    expect(
      result.container.querySelector('a[href="#decision-brief"]'),
    ).not.toBeNull();
    expect(
      result.container.querySelector('a[href="#team-debate"]'),
    ).not.toBeNull();
    expect(
      result.container.querySelector(".research-conclusion-hero"),
    ).toBeNull();
  });

  it("uses materially different DOM landmark orders instead of the former generic card silhouette", () => {
    const market = teamReportPreviewFixture("market");
    const company = teamReportPreviewFixture("company");
    const marketRender = render(bodies("market", market));
    const marketOrder = Array.from(
      marketRender.container.querySelectorAll("[data-market-landmark]"),
      (node) => node.getAttribute("data-market-landmark"),
    );
    marketRender.unmount();
    const companyRender = render(bodies("company", company));
    const companyOrder = Array.from(
      companyRender.container.querySelectorAll("[data-company-landmark]"),
      (node) => node.getAttribute("data-company-landmark"),
    );

    expect(marketOrder).toEqual([
      "market-tape",
      "regime-quadrant",
      "relative-performance",
      "price-volume-ladder",
      "confirmation-map",
      "signal-persistence",
      "catalyst-clock",
    ]);
    expect(companyOrder).toEqual([
      "operating-snapshot",
      "segment-mix",
      "adoption-proof",
      "growth-adoption-ledger",
      "moat-verification",
      "qualified-peer-comparison",
      "milestone-erosion-ladder",
    ]);
    expect(marketOrder).not.toEqual(companyOrder);
  });

  it("keeps metric lineage in data attributes without exposing internal IDs", () => {
    const market = teamReportPreviewFixture("market");
    const marketRender = render(bodies("market", market));
    expect(
      marketRender.container.querySelectorAll(
        '[data-metric-id="relative_performance_3m"][data-period="3M"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      marketRender.container.querySelector(
        '[data-metric-id="support_price:primary"][data-period="20D"]',
      ),
    ).toBeInTheDocument();
    expect(marketRender.container.textContent).not.toContain(
      "relative_performance_3m",
    );
    marketRender.unmount();

    const company = teamReportPreviewFixture("company");
    const companyRender = render(bodies("company", company));
    expect(
      companyRender.container.querySelectorAll(
        '[data-metric-id="segment_share:data_center"][data-period="FY2026 Q2"]',
      ).length,
    ).toBeGreaterThan(0);
    const comparatorCell = companyRender.container.querySelector(
      '[data-metric-id="revenue_growth"][data-source-id="S03"]',
    );
    expect(comparatorCell).not.toBeNull();
  });

  it("omits only the benchmark chart when the benchmark is missing or sparse", () => {
    const complete = teamReportPreviewFixture("market");
    if (complete.metricSnapshot === undefined)
      throw new TypeError("missing market metric fixture");
    const { comparatorQualification: _qualification, ...withoutBenchmark } =
      complete.metricSnapshot;
    const missing: ResearchFileData = {
      ...complete,
      metricSnapshot: withoutBenchmark,
    };
    const result = render(bodies("market", missing));
    expect(
      result.container.querySelector(
        '[data-market-landmark="relative-performance"]',
      ),
    ).toBeNull();
    expect(
      result.container.querySelector(
        '[data-market-landmark="regime-quadrant"]',
      ),
    ).not.toBeNull();
    expect(
      result.container.querySelector(
        '[data-market-landmark="price-volume-ladder"]',
      ),
    ).not.toBeNull();
  });

  it("omits a segment chart for missing or malformed segment points while retaining the business board", () => {
    const complete = teamReportPreviewFixture("company");
    if (complete.metricSnapshot === undefined)
      throw new TypeError("missing company metric fixture");
    const malformed: ResearchFileData = {
      ...complete,
      metricSnapshot: {
        ...complete.metricSnapshot,
        metrics: complete.metricSnapshot.metrics.map((metric) =>
          metric.id === "segment_share:data_center"
            ? ({ ...metric, period: undefined } as unknown as typeof metric)
            : metric.id === "segment_share:gaming"
              ? ({ ...metric, id: "" } as typeof metric)
              : metric,
        ),
      },
    };
    const result = render(bodies("company", malformed));
    expect(
      result.container.querySelector('[data-company-landmark="segment-mix"]'),
    ).toBeNull();
    expect(
      result.container.querySelector(
        '[data-company-landmark="adoption-proof"]',
      ),
    ).not.toBeNull();
    expect(
      screen.getByText("Business engines & adoption proof"),
    ).toBeInTheDocument();
  });

  it("never renders unqualified comparator rows", () => {
    const complete = teamReportPreviewFixture("company");
    if (complete.metricSnapshot?.comparatorQualification === undefined)
      throw new TypeError("missing comparator fixture");
    const unqualified: ResearchFileData = {
      ...complete,
      metricSnapshot: {
        ...complete.metricSnapshot,
        comparatorQualification: {
          ...complete.metricSnapshot.comparatorQualification,
          status: "no_qualified_comparison",
          rows: complete.metricSnapshot.comparatorQualification.rows.map(
            (row) => ({
              ...row,
              displayEligibility: false,
              exclusionReasons: ["insufficient_aligned_metrics"],
            }),
          ),
          displayGroups: [],
        },
      },
    };
    const result = render(bodies("company", unqualified));
    expect(
      result.container.querySelector(
        '[data-company-landmark="qualified-peer-comparison"]',
      ),
    ).toBeNull();
    expect(
      result.container.querySelector(
        '[data-company-landmark="milestone-erosion-ladder"]',
      ),
    ).not.toBeNull();
  });
});

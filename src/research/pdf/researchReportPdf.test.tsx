import { describe, expect, it } from "vitest";
import { ResearchReportSchema } from "../domain/report";
import { validReport } from "../domain/report.testSupport";
import { researchReportToFile } from "../researchReportToFile";
import {
  departmentWorkflowV2PresentationFixture,
  workflowV2PresentationFixture,
} from "../workflowV2Presentation.testSupport";
import { buildResearchFilePdfDocument } from "./renderEditorialResearchReportPdf";
import { renderResearchReportPdf } from "./researchReportPdf";

function serializedDocument(value: unknown): string {
  const parts: string[] = [];
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      parts.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (typeof candidate === "object" && candidate !== null)
      for (const item of Object.values(candidate)) visit(item);
  };
  visit(value);
  return parts.join("");
}

describe("research report PDF", () => {
  it("renders a compact report with a dedicated source appendix", async () => {
    const bytes = await renderResearchReportPdf({
      report: ResearchReportSchema.parse(validReport()),
      symbol: "NVDA",
      locale: "ko",
      createdAt: "2026-07-23T06:00:00.000Z",
    });
    const content = bytes.toString("latin1");
    expect(content.startsWith("%PDF-")).toBe(true);
    expect(content.match(/\/Type\s*\/Page\b/g)).toHaveLength(6);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  }, 20_000);

  it("uses the persisted committee hierarchy without the stale score hero", async () => {
    const report = workflowV2PresentationFixture();
    const file = researchReportToFile(report, "2026-07-31T20:00:00.000Z");
    const definition = buildResearchFilePdfDocument({
      file,
      symbol: "NVDA",
      locale: "en",
      createdAt: "2026-07-31T20:00:00.000Z",
      version: report.version,
    });
    const content = serializedDocument(definition.content);

    expect(content).toContain("Committee decision cockpit");
    expect(content).toContain("Wait for proof");
    expect(content).toContain("Medium confidence");
    expect(content).toContain("Persisted decisive reason.");
    expect(content).toContain("Persisted strongest countercase.");
    expect(content).toContain("Decision-level falsifier.");
    expect(content).toContain("Persisted question 1?");
    expect(content).toContain("Complete source & evidence appendix");
    expect(content).not.toContain("TEAM CONCLUSION INDEX");
    expect(content).not.toContain("/ 100");

    const bytes = await renderResearchReportPdf({
      report,
      symbol: "NVDA",
      locale: "en",
      createdAt: "2026-07-31T20:00:00.000Z",
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  }, 20_000);

  it("serializes public PDF text without private source, role, or raw percentage labels", () => {
    const report = workflowV2PresentationFixture();
    const base = researchReportToFile(report, "2026-07-31T20:00:00.000Z");
    const structuredEditorial = base.structuredEditorial;
    if (structuredEditorial === undefined)
      throw new TypeError(
        "workflow-v2 fixture is missing structured editorial data",
      );
    const file = {
      ...base,
      evidenceIndex: [
        {
          id: "S01",
          publisher: "InsightSentry via RapidAPI",
          title: "insightsentry:quote",
          sourceClass: "insightsentry_rapidapi",
          url: "https://insightsentry.com/quote/NVDA",
        },
        {
          id: "S02",
          publisher: "company_competition",
          title: "memo:company_competition",
          sourceClass: "accepted_agent_artifact",
        },
      ],
      structuredEditorial: {
        ...structuredEditorial,
        claims: structuredEditorial.claims.map((claim, index) =>
          index === 0
            ? {
                ...claim,
                roleOwner: "financial_quality",
                decisionDimension: "mitigant" as const,
                publicThesis: {
                  en: "Cloud-provider results preserve legitimate supplier context.",
                  ko: "합법적인 제공업체 문맥을 보존합니다.",
                },
              }
            : claim,
        ),
      },
      metricSnapshot: {
        asOf: "2026-07-31T20:00:00.000Z",
        metrics: [],
        comparatorQualification: {
          status: "qualified" as const,
          rawPeerArtifactId: "raw-peer",
          rawArtifactCount: 1,
          rows: [
            {
              comparatorId: "peer",
              name: "Peer Co",
              role: "operating_comparable" as const,
              rationale: {
                en: "same provider sector",
                ko: "same provider sector",
              },
              comparableMetricKeys: ["gross_margin"],
              normalizedMetrics: [
                {
                  key: "gross_margin",
                  value: 63.3800149035776,
                  period: "TTM",
                  unit: "percent",
                  evidenceArtifactIds: ["raw-peer"],
                },
              ],
              evidenceArtifactIds: ["raw-peer"],
              displayEligibility: true,
              medianEligibility: true,
              exclusionReasons: [],
            },
          ],
          displayGroups: [
            { role: "operating_comparable" as const, comparatorIds: ["peer"] },
          ],
          valuation: {
            status: "not_eligible" as const,
            reason: "valuation_metric_unavailable" as const,
            eligibleCompanyCount: 1,
          },
        },
      },
    };
    const definition = buildResearchFilePdfDocument({
      file,
      symbol: "NVDA",
      locale: "en",
      createdAt: "2026-07-31T20:00:00.000Z",
      version: report.version,
    });
    const content = serializedDocument(definition.content);

    expect(content).toContain("Market evidence");
    expect(content).toContain("63.38%");
    expect(content).toContain(
      "Cloud-provider results preserve legitimate supplier context.",
    );
    expect(content).not.toMatch(
      /InsightSentry|RapidAPI|insightsentry\.com|company_competition|financial_quality|risk_policy|63\.3800149035776%/iu,
    );
  });

  it.each([
    [
      "market",
      "Market timing brief",
      "Regime, relative performance & price levels",
    ],
    [
      "company",
      "Company operating brief",
      "Growth engine, adoption & moat verification",
    ],
    [
      "financial",
      "Financial expectations brief",
      "Revenue to margin to cash conversion & expectations",
    ],
    [
      "risk",
      "Risk escalation brief",
      "Downside path, leading indicators & escalation",
    ],
  ] as const)(
    "gives the %s PDF its distinct structured hierarchy",
    (department, firstPageTitle, detailTitle) => {
      const report = departmentWorkflowV2PresentationFixture(department);
      const file = researchReportToFile(report, "2026-07-31T20:00:00.000Z");
      const definition = buildResearchFilePdfDocument({
        file,
        symbol: "NVDA",
        locale: "en",
        createdAt: "2026-07-31T20:00:00.000Z",
        version: report.version,
      });
      const content = serializedDocument(definition.content);

      expect(content).toContain(firstPageTitle);
      expect(content).toContain(detailTitle);
      expect(content).toContain(`Persisted ${department} decision.`);
      expect(content).not.toContain("TEAM CONCLUSION INDEX");
      expect(content).not.toContain("SCENARIO ASSUMPTIONS");
      expect(content).not.toContain("VERIFIED ACTUAL METRICS");
      expect(content).not.toContain("QUALIFIED COMPARISON");
    },
  );
});

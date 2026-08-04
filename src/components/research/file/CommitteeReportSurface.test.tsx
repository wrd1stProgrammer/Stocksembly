import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { committeeReportPreviewFixture } from "../../../research/committeeReportPreviewFixture";
import { WorkflowV2ResearchReportSchema } from "../../../research/domain/report";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { researchReportToFile } from "../../../research/researchReportToFile";
import { teamReportPreviewFixture } from "../../../research/teamReportPreviewFixture";
import { workflowV2PresentationFixture } from "../../../research/workflowV2Presentation.testSupport";
import { CompletedResearchFile } from "../CompletedResearchFile";
import { buildCommitteeDecisionModel } from "./committeeDecisionModel";

const company = {
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  exchange: "NASDAQ",
  sector: "Semiconductors",
  price: "",
  change: "",
  marketStatus: { en: "", ko: "" },
};

function committeeFile() {
  return committeeReportPreviewFixture();
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function wordJaccard(first: string, second: string): number {
  const left = new Set(normalized(first).split(" ").filter(Boolean));
  const right = new Set(normalized(second).split(" ").filter(Boolean));
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

type RuntimeRegisterClaim = Record<string, unknown> & {
  disposition?: unknown;
  sourceIds?: unknown;
  originClaimId?: unknown;
  revisionHash?: unknown;
};

function withRuntimeClaimRegister(
  file: ReturnType<typeof committeeReportPreviewFixture>,
  mutate?: (register: RuntimeRegisterClaim[]) => void,
) {
  const claims = file.structuredEditorial?.claims ?? [];
  const register: RuntimeRegisterClaim[] = claims.map((claim) => ({
    claimId: claim.claimId,
    materiality: claim.materiality,
    semanticVerdict: "entailed",
    sourceIds: [...claim.evidenceArtifactIds],
    disposition: "accepted",
  }));
  mutate?.(register);
  return {
    ...file,
    structuredEditorial: {
      ...file.structuredEditorial,
      claimRegister: register,
    },
  } as unknown as typeof file;
}

describe("CommitteeReportSurface", () => {
  it("opens with a typed decision cockpit instead of a pseudo-precision score", () => {
    const { container } = render(
      <CompletedResearchFile
        company={company}
        locale="en"
        report={committeeFile()}
        version={2}
        reportId="committee-fixture"
        onReplay={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-committee-cockpit]")).toBeVisible();
    expect(container.querySelector("[data-cockpit-view]")).toHaveTextContent(
      "Wait for proof",
    );
    expect(
      container.querySelector("[data-cockpit-confidence]"),
    ).toHaveTextContent("Medium");
    expect(
      container.querySelector("[data-cockpit-falsifier]"),
    ).toHaveTextContent("Decision-level falsifier.");
    expect(container.querySelector("[data-cockpit-next-event]")).toBeTruthy();
    expect(container.querySelectorAll("[data-decision-driver]")).toHaveLength(
      3,
    );
    expect(container.querySelector(".research-conclusion-hero")).toBeNull();
    expect(screen.queryByText("Team conclusion index")).not.toBeInTheDocument();
    expect(screen.queryByText("/ 100")).not.toBeInTheDocument();

    expect(
      container.querySelectorAll(
        ".research-anticipated-qa > .research-anticipated-qa__grid > article",
      ),
    ).toHaveLength(5);
    const qaDetails = container.querySelector<HTMLDetailsElement>(
      "details[data-qa-expandable-count]",
    );
    expect(qaDetails).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Show 5 more questions"));
    expect(qaDetails).toHaveAttribute("open");

    const sources = container.querySelector<HTMLDetailsElement>(
      "details[data-committee-sources]",
    );
    expect(sources).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/research/reports/committee-fixture/pdf?lang=en",
    );
  });

  it("uses three accepted material claims with owned rationale and source lineage", () => {
    const file = committeeReportPreviewFixture();
    const editorial = buildResearchFileEditorialModel(file, "en");
    const model = buildCommitteeDecisionModel(file, editorial, "en");
    expect(model).toBeDefined();
    if (model === undefined) return;

    expect(model.drivers).toHaveLength(3);
    expect(new Set(model.drivers.map((driver) => driver.id)).size).toBe(3);
    expect(
      model.drivers.map((driver) => driver.decisionDimension),
    ).not.toContain("catalyst");
    expect(
      model.drivers.every(
        (driver) =>
          normalized(driver.why) !== normalized(driver.thesis) &&
          normalized(driver.why) !== normalized(driver.falsifier) &&
          driver.sourceLineage.evidenceArtifactIds.length > 0 &&
          driver.sourceLineage.departmentId === driver.departmentId,
      ),
    ).toBe(true);

    const primaryIds = new Set(
      file.structuredEditorial?.decision.primaryClaimIds ?? [],
    );
    expect(model.drivers.every((driver) => primaryIds.has(driver.id))).toBe(
      true,
    );
    expect(model.drivers.every((driver) => !driver.owner.includes("_"))).toBe(
      true,
    );
    expect(
      model.adjudicationRows.some(
        (row) => row.adjudication === "Accepted driver",
      ),
    ).toBe(true);
    const repeatedSurfaceTexts = [
      ...model.drivers.flatMap((driver) => [driver.thesis, driver.why]),
      ...(model.nextEvent === undefined ? [] : [model.nextEvent.label]),
      ...model.catalysts.flatMap((catalyst) => [
        catalyst.headline,
        catalyst.body,
      ]),
      ...model.ownedAnalysis.map((item) => item.thesis),
    ].map(normalized);
    expect(new Set(repeatedSurfaceTexts).size).toBe(
      repeatedSurfaceTexts.length,
    );
    for (const [index, first] of repeatedSurfaceTexts.entries()) {
      for (const second of repeatedSurfaceTexts.slice(index + 1))
        expect(wordJaccard(first, second)).toBeLessThan(0.68);
    }
    const thresholds = [
      model.falsifier,
      ...model.drivers.map((driver) => driver.falsifier),
      ...model.catalysts.map((catalyst) => catalyst.body),
    ].map(normalized);
    expect(new Set(thresholds).size).toBe(thresholds.length);
  });

  it("formats the current change as a bounded signed percentage", () => {
    const file = {
      ...committeeReportPreviewFixture(),
      marketSnapshot: {
        ...committeeReportPreviewFixture().marketSnapshot!,
        changePercent: -0.9016189290161893,
      },
    };
    const model = buildCommitteeDecisionModel(
      file,
      buildResearchFileEditorialModel(file, "en"),
      "en",
    );

    expect(model?.price?.change).toBe("-0.9%");
  });

  it("labels specialist-owned primary claims and adjudicates them through their department", () => {
    const source = committeeReportPreviewFixture();
    const structured = source.structuredEditorial;
    const primaryClaimId = structured?.decision.primaryClaimIds[0];
    if (structured === undefined || primaryClaimId === undefined)
      throw new TypeError("committee fixture has no primary claim");
    const file = {
      ...source,
      structuredEditorial: {
        ...structured,
        claims: structured.claims.map((claim) =>
          claim.claimId === primaryClaimId
            ? { ...claim, roleOwner: "company_product" as const }
            : claim,
        ),
      },
    };

    const model = buildCommitteeDecisionModel(
      file,
      buildResearchFileEditorialModel(file, "en"),
      "en",
    );

    expect(model?.drivers[0]?.owner).toBe("Aria");
    expect(
      model?.adjudicationRows.find((row) => row.departmentId === "company")
        ?.adjudication,
    ).toBe("Accepted driver");
  });

  it("rejects removed, unstatused, originless revised, and unknown-source claims", () => {
    const probes = [
      (register: RuntimeRegisterClaim[]) => {
        if (register[0] !== undefined) register[0].disposition = "removed";
      },
      (register: RuntimeRegisterClaim[]) => {
        if (register[0] !== undefined) delete register[0].disposition;
      },
      (register: RuntimeRegisterClaim[]) => {
        if (register[0] !== undefined) register[0].disposition = "revised";
      },
      (register: RuntimeRegisterClaim[]) => {
        if (register[0] !== undefined)
          register[0].sourceIds = ["ffffffff-ffff-4fff-8fff-ffffffffffff"];
      },
    ];

    for (const mutate of probes) {
      const file = withRuntimeClaimRegister(
        committeeReportPreviewFixture(),
        mutate,
      );
      const editorial = buildResearchFileEditorialModel(file, "en");
      const model = buildCommitteeDecisionModel(file, editorial, "en");
      expect(model?.drivers).toHaveLength(2);
    }
  });

  it("keeps revised adjudicated IDs with explicit origin lineage", () => {
    const originClaimId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const file = withRuntimeClaimRegister(
      committeeReportPreviewFixture(),
      (register) => {
        if (register[2] !== undefined) {
          register[2].disposition = "revised";
          register[2].originClaimId = originClaimId;
          register[2].revisionHash = "a".repeat(64);
        }
      },
    );
    const editorial = buildResearchFileEditorialModel(file, "en");
    const model = buildCommitteeDecisionModel(file, editorial, "en");

    expect(model?.drivers[2]?.sourceLineage.originClaimId).toBe(originClaimId);
    expect(model?.drivers[2]?.id).toBe(
      file.structuredEditorial?.decision.primaryClaimIds[2],
    );
  });

  it("keeps active catalysts and only unique owned analysis in document order", () => {
    const file = committeeReportPreviewFixture();
    const editorial = buildResearchFileEditorialModel(file, "en");
    const model = buildCommitteeDecisionModel(file, editorial, "en");
    expect(model?.catalysts.length).toBeGreaterThanOrEqual(1);
    expect(model?.ownedAnalysis.length).toBeGreaterThanOrEqual(1);

    const ids = [
      ...(model?.drivers.map((item) => item.id) ?? []),
      ...(model?.nextEvent === undefined ? [] : [model.nextEvent.id]),
      ...(model?.catalysts.map((item) => item.id) ?? []),
      ...(model?.ownedAnalysis.map((item) => item.id) ?? []),
    ];
    expect(new Set(ids).size).toBe(ids.length);

    const { container } = render(
      <CompletedResearchFile
        company={company}
        locale="en"
        report={file}
        version={2}
        onReplay={vi.fn()}
      />,
    );
    expect(
      Array.from(container.querySelectorAll("[data-report-section]")).map(
        (section) => section.getAttribute("data-report-section"),
      ),
    ).toEqual([
      "cover",
      "decision",
      "evidence-read",
      "adjudication",
      "scenarios",
      "catalysts",
      "analysis",
      "anticipated-qa",
      "sources",
    ]);
  });

  it("keeps missing price, valuation, and events bounded without inventing a range", () => {
    const source = workflowV2PresentationFixture();
    const sparse = WorkflowV2ResearchReportSchema.parse({
      ...source,
      marketSnapshot: undefined,
      metricSnapshot: undefined,
      comparators: [],
      editorialClaims: source.editorialClaims.map((claim) => ({
        ...claim,
        decisionDimension:
          claim.decisionDimension === "catalyst"
            ? ("growth_engine" as const)
            : claim.decisionDimension,
      })),
      locales: {
        en: { ...source.locales.en, scenarios: [] },
        ko: { ...source.locales.ko, scenarios: [] },
      },
    });
    const file = researchReportToFile(sparse, "2026-07-31T00:00:00.000Z");
    const { container } = render(
      <CompletedResearchFile
        company={company}
        locale="en"
        report={file}
        version={2}
        onReplay={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-cockpit-price]")).toBeNull();
    expect(container.querySelectorAll("[data-decision-driver]")).toHaveLength(
      2,
    );
    expect(
      container.querySelector("[data-cockpit-next-event]"),
    ).toHaveTextContent("Risk-specific falsifier");
    expect(
      container.querySelector("[data-operating-scenarios]"),
    ).toBeVisible();
    expect(
      container.querySelectorAll(
        "[data-operating-scenarios] .committee-operating-scenarios__grid > article",
      ),
    ).toHaveLength(3);
    expect(container.querySelector("[data-valuation-status]")).toBeNull();
    expect(
      container.querySelector(".committee-expectations")?.textContent,
    ).not.toMatch(/\$\s?\d|\d+\s?[-–]\s?\d+/u);
  });

  it("keeps workflow-v2 evidence, counterpoints, and checkpoints distinct", () => {
    const report = WorkflowV2ResearchReportSchema.parse({
      ...workflowV2PresentationFixture(),
      locales: {
        en: { ...workflowV2PresentationFixture().locales.en, scenarios: [] },
        ko: { ...workflowV2PresentationFixture().locales.ko, scenarios: [] },
      },
    });
    const file = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
    const model = buildResearchFileEditorialModel(file, "en");

    expect(model.valuationConclusion.length).toBeGreaterThan(0);
    expect(model.comparisonRows.length).toBeGreaterThanOrEqual(2);
    expect(model.scenarios.length).toBeGreaterThanOrEqual(2);
    expect(
      new Set(model.analysisRows.map((row) => normalized(row.evidence))).size,
    ).toBe(model.analysisRows.length);
    expect(
      new Set(model.analysisRows.map((row) => normalized(row.counterpoint)))
        .size,
    ).toBe(model.analysisRows.length);
    expect(
      model.analysisRows.every(
        (row) =>
          normalized(row.evidence) !== normalized(row.counterpoint) &&
          normalized(row.agentView) !== normalized(row.counterpoint) &&
          normalized(row.checkpoint) !== normalized(row.counterpoint),
      ),
    ).toBe(true);
  });

  it("uses the compact team verdict instead of the oversized score hero", () => {
    const { container } = render(
      <CompletedResearchFile
        company={company}
        locale="en"
        report={teamReportPreviewFixture("market")}
        version={2}
        onReplay={vi.fn()}
      />,
    );

    expect(container.querySelector(".research-conclusion-hero")).toBeNull();
    expect(container.querySelector(".research-team-verdict")).toBeVisible();
    expect(container.querySelector("[data-committee-cockpit]")).toBeNull();
  });
});

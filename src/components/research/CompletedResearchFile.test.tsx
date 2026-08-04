import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { committeeReportPreviewFixture } from "../../research/committeeReportPreviewFixture";
import { fixtureData } from "../../research/compositions/fixture";
import type { WorkflowDepartmentId } from "../../research/domain/roleRegistry";
import { teamReportPreviewFixture } from "../../research/teamReportPreviewFixture";
import { CompletedResearchFile } from "./CompletedResearchFile";

const company = fixtureData.createCompany(
  "NVDA",
  "NVIDIA Corporation",
  "NASDAQ",
  "Semiconductors",
);

describe("CompletedResearchFile", () => {
  it("renders a persisted legacy-v1 report with its legacy document instead of an empty v2 surface", () => {
    const legacyReport = {
      ...fixtureData.report,
      presentationVersion: "legacy-v1" as const,
    };

    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={legacyReport}
        locale="en"
        version={1}
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getByText("EVIDENCE-AUDITED EQUITY RESEARCH")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "The evidence behind the headline",
      }),
    ).toBeVisible();
    expect(
      container.querySelector('[data-report-surface="committee"]'),
    ).not.toBeInTheDocument();
  });

  it("shows a continuous evidence dossier with navigable decision layers", () => {
    const onReplay = vi.fn();
    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={committeeReportPreviewFixture()}
        locale="en"
        version={2}
        onReplay={onReplay}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Focus on margin durability and competitive pressure",
      }),
    ).toBeVisible();
    expect(screen.getByText("NVDA")).toBeVisible();
    expect(screen.getByText("NVIDIA Corporation")).toBeVisible();
    expect(screen.getByText("v2.0")).toBeVisible();
    expect(screen.getByText("Wait for proof")).toBeVisible();
    expect(screen.getByText("Decisive reason")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Research file sections" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Decision" })).toHaveAttribute(
      "href",
      "#decision-brief",
    );
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(
      container.querySelector('[data-report-surface="committee"]'),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-committee-cockpit]")).toBeVisible();
    expect(container.querySelector("[data-report-page]")).toBeNull();
    expect(screen.getByText("Valuation & expectations")).toBeVisible();
    expect(screen.getByText("Team conflict & adjudication")).toBeVisible();
    expect(screen.getByText("Sources & evidence register")).toBeInTheDocument();
    expect(screen.queryByText("Team conclusion index")).not.toBeInTheDocument();
    expect(screen.getByText("Evidence reliability")).toBeVisible();
    expect(screen.queryByText("Audit passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Linked evidence")).toHaveLength(0);
    expect(container.querySelectorAll("[data-decision-driver]")).toHaveLength(
      3,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(
      container.querySelector("[data-report-theme='dark']"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Replay research room" }),
    );
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it("gives every focused team its own decision framework", () => {
    const cases: readonly [
      WorkflowDepartmentId,
      string,
      string,
      readonly string[],
    ][] = [
      [
        "market",
        "국면·타이밍 보드",
        "가격대·지속성·촉매 시계",
        [
          "cover",
          "market-regime",
          "market-timing",
          "anticipated-qa",
          "sources",
        ],
      ],
      [
        "company",
        "사업 엔진·채택 증거",
        "경쟁 좌표·실행 사다리",
        [
          "cover",
          "company-business",
          "company-moat",
          "anticipated-qa",
          "sources",
        ],
      ],
      [
        "financial",
        "이익·밸류에이션 랩",
        "내재 기대·안전마진",
        [
          "cover",
          "decision",
          "comparison",
          "expectations",
          "debate",
          "anticipated-qa",
          "sources",
        ],
      ],
      [
        "risk",
        "리스크 레지스터",
        "조기경보·논지 파기 조건",
        [
          "cover",
          "decision",
          "escalation",
          "debate",
          "comparison",
          "anticipated-qa",
          "sources",
        ],
      ],
    ];

    for (const [
      departmentId,
      primaryTitle,
      secondaryTitle,
      sections,
    ] of cases) {
      const { container, unmount } = render(
        <CompletedResearchFile
          company={company}
          report={teamReportPreviewFixture(departmentId)}
          locale="ko"
          version={2}
          onReplay={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { name: primaryTitle })).toBeVisible();
      expect(
        screen.getByRole("heading", { name: secondaryTitle }),
      ).toBeVisible();
      expect(
        container.querySelector(`[data-report-department="${departmentId}"]`),
      ).toBeInTheDocument();
      expect(
        container.querySelector(`[data-report-surface="${departmentId}"]`),
      ).toBeInTheDocument();
      expect(
        Array.from(container.querySelectorAll("[data-report-section]")).map(
          (section) => section.getAttribute("data-report-section"),
        ),
      ).toEqual(sections);
      unmount();
    }
  });

  it("preserves source, PDF, theme, and replay actions in the shared chrome", () => {
    const onReplay = vi.fn();
    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={committeeReportPreviewFixture()}
        locale="en"
        version={2}
        reportId="report-fixture"
        onReplay={onReplay}
      />,
    );

    expect(screen.getByText("Show 1 sources")).toBeVisible();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      "/api/research/reports/report-fixture/pdf?lang=en",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(
      container.querySelector('[data-report-theme="dark"]'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Replay research room" }),
    );
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it("fails closed for an unknown runtime report target", () => {
    const malformedReport = {
      ...fixtureData.report,
      researchTarget: { kind: "department", departmentId: "unknown" },
    } as unknown as typeof fixtureData.report;

    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={malformedReport}
        locale="en"
        version={2}
        onReplay={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unsupported research report",
    );
    expect(
      container.querySelector('[data-report-surface="unsupported"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-report-surface="committee"]'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Team conclusion index")).not.toBeInTheDocument();
  });

  it("keeps each team surface body in its own ownership module", () => {
    const cases = ["Market", "Company", "Financial", "Risk"] as const;
    for (const surface of cases) {
      const source = readFileSync(
        resolve(
          process.cwd(),
          `src/components/research/file/${surface}ReportSurface.tsx`,
        ),
        "utf8",
      );
      expect(source).toContain(`./${surface}ReportBody`);
      expect(source).not.toContain("ResearchFileDepartmentBrief");
    }
  });
});

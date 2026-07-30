import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("shows a continuous evidence dossier with navigable decision layers", () => {
    const onReplay = vi.fn();
    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={fixtureData.report}
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
    expect(screen.getByText("Key catalysts")).toBeVisible();
    expect(screen.getByText("Key risks")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Research file sections" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Decision" })).toHaveAttribute(
      "href",
      "#decision-brief",
    );
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(container.querySelectorAll("[data-report-section]")).toHaveLength(6);
    expect(container.querySelector("[data-report-page]")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Valuation & relative comparison")).toBeVisible();
    expect(screen.getByText("Agent debate & final judgment")).toBeVisible();
    expect(screen.getByText("Claim audit mix")).toBeVisible();
    expect(screen.getByText("Decision paths")).toBeVisible();
    expect(screen.getByText("Business, earnings & key theses")).toBeVisible();
    expect(screen.queryByText("Decision lens")).not.toBeInTheDocument();
    expect(screen.getByText("Sources & evidence register")).toBeInTheDocument();
    expect(screen.getByText("Team conclusion index")).toBeVisible();
    expect(screen.getByText("Evidence reliability")).toBeVisible();
    expect(screen.queryByText("Audit passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Linked evidence")).toHaveLength(0);
    expect(container.querySelectorAll(".research-team-portrait")).toHaveLength(
      5,
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
    const cases: readonly [WorkflowDepartmentId, string, string][] = [
      ["market", "시장 타이밍 맵", "확인 구간·촉매 시계"],
      ["company", "성장 엔진 맵", "실행 마일스톤·해자 검증"],
      ["financial", "이익·밸류에이션 랩", "내재 기대·안전마진"],
      ["risk", "리스크 레지스터", "조기경보·논지 파기 조건"],
    ];

    for (const [departmentId, primaryTitle, secondaryTitle] of cases) {
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
        Array.from(container.querySelectorAll("[data-report-section]")).map(
          (section) => section.getAttribute("data-report-section"),
        ),
      ).toEqual([
        "cover",
        "comparison",
        "decision",
        "scenarios",
        "debate",
        "anticipated-qa",
        "sources",
      ]);
      unmount();
    }
  });
});

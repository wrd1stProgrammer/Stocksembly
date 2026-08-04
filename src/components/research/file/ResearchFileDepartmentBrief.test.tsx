import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkflowDepartmentId } from "../../../research/domain/roleRegistry";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { researchReportToFile } from "../../../research/researchReportToFile";
import { departmentWorkflowV2PresentationFixture } from "../../../research/workflowV2Presentation.testSupport";
import {
  ResearchFileDepartmentBrief,
  ResearchFileDepartmentFramework,
} from "./ResearchFileDepartmentBrief";

describe("workflow-v2 department checkpoint ownership", () => {
  it.each(["market", "company", "financial", "risk"] as const)(
    "renders only %s claim-owned falsifiers and no decision-global checkpoint",
    (departmentId: WorkflowDepartmentId) => {
      // Given
      const report = departmentWorkflowV2PresentationFixture(departmentId);
      const file = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
      const model = buildResearchFileEditorialModel(file, "en");

      // When
      const { container } = render(
        <>
          <ResearchFileDepartmentBrief
            departmentId={departmentId}
            file={file}
            model={model}
            locale="en"
          />
          <ResearchFileDepartmentFramework
            departmentId={departmentId}
            file={file}
            model={model}
            locale="en"
          />
        </>,
      );

      // Then
      expect(
        screen.getAllByText(`Persisted ${departmentId} falsifier.`).length,
      ).toBeGreaterThan(0);
      expect(
        screen.queryByText(report.editorialDecision.falsifier.en),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".research-visual-empty")).toBeNull();
    },
  );

  it("does not synthesize or render stance-derived posture as market body copy", () => {
    // Given
    const report = departmentWorkflowV2PresentationFixture("market");
    const file = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
    const model = buildResearchFileEditorialModel(file, "en");

    // When
    render(
      <ResearchFileDepartmentBrief
        departmentId="market"
        file={file}
        model={model}
        locale="en"
      />,
    );

    // Then
    expect(model.structuredDecision?.stance).toBe("wait_for_proof");
    expect(model.posture).toBe("");
    expect(screen.queryByText("Wait for proof")).not.toBeInTheDocument();
    expect(file.postureLabel).toEqual({ en: "", ko: "" });
  });

  it("omits a matching-dimension checkpoint owned by a different department role", () => {
    // Given
    const report = departmentWorkflowV2PresentationFixture("company");
    const wrongOwnerReport = {
      ...report,
      editorialClaims: report.editorialClaims.map((claim) => ({
        ...claim,
        roleOwner: "market_news",
      })),
    };
    const file = researchReportToFile(
      wrongOwnerReport,
      "2026-07-31T00:00:00.000Z",
    );
    const model = buildResearchFileEditorialModel(file, "en");

    // When
    render(
      <ResearchFileDepartmentFramework
        departmentId="company"
        file={file}
        model={model}
        locale="en"
      />,
    );

    // Then
    expect(model.structuredClaims).toEqual([]);
    expect(
      screen.queryByText("Persisted company falsifier."),
    ).not.toBeInTheDocument();
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { researchReportToFile } from "../../../research/researchReportToFile";
import { workflowV3PresentationFixture } from "../../../research/workflowV3Presentation.testSupport";
import { DepartmentResearchDesk } from "./DepartmentResearchDesk";

const states = [
  ["upside_skewed", "Upside skewed"],
  ["downside_skewed", "Downside skewed"],
  ["balanced", "Balanced"],
  ["insufficient_evidence", "Insufficient evidence"],
] as const;

describe("DepartmentResearchDesk workflow-v3 stance", () => {
  it.each(states)(
    "renders %s with the canonical public label",
    (stance, label) => {
      const source = workflowV3PresentationFixture("en");
      const report = {
        ...source,
        editorialDecision: { ...source.editorialDecision, stance },
      };
      const file = researchReportToFile(report, "2026-08-29T00:00:00.000Z");
      const model = buildResearchFileEditorialModel(file, "en");
      const result = render(
        <DepartmentResearchDesk
          file={file}
          model={model}
          locale="en"
          departmentId="market"
        />,
      );
      expect(result.container.textContent).toContain(label);
    },
  );
});

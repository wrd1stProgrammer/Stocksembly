import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { researchReportToFile } from "../../../research/researchReportToFile";
import { workflowV3PresentationFixture } from "../../../research/workflowV3Presentation.testSupport";
import { ResearchFileHeader } from "./ResearchFileHeader";

const states = [
  ["upside_skewed", "Upside skewed"],
  ["downside_skewed", "Downside skewed"],
  ["balanced", "Balanced"],
  ["insufficient_evidence", "Insufficient evidence"],
] as const;

describe("ResearchFileHeader workflow-v3 stance", () => {
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
        <ResearchFileHeader
          company={{
            symbol: "TEST",
            company: "Test Company",
            exchange: "NASDAQ",
            sector: "Technology",
            price: "$100",
            change: "0%",
            marketStatus: { en: "Open", ko: "개장" },
          }}
          file={file}
          model={model}
          locale="en"
          version={3}
          theme="light"
          onThemeChange={() => undefined}
          titleRef={createRef<HTMLHeadingElement>()}
        />,
      );
      expect(result.container.textContent).toContain(label);
    },
  );
});

import { describe, expect, it } from "vitest";
import { buildResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { researchReportToFile } from "../../../research/researchReportToFile";
import { workflowV3PresentationFixture } from "../../../research/workflowV3Presentation.testSupport";
import { buildCommitteeDecisionModel } from "./committeeDecisionModel";

const states = [
  ["upside_skewed", "Upside skewed"],
  ["downside_skewed", "Downside skewed"],
  ["balanced", "Balanced"],
  ["insufficient_evidence", "Insufficient evidence"],
] as const;

describe("committee decision workflow-v3 stance", () => {
  it.each(states)("maps %s to the canonical public label", (stance, label) => {
    const source = workflowV3PresentationFixture("en");
    const report = {
      ...source,
      editorialDecision: { ...source.editorialDecision, stance },
    };
    const file = researchReportToFile(report, "2026-08-29T00:00:00.000Z");
    const model = buildResearchFileEditorialModel(file, "en");
    expect(buildCommitteeDecisionModel(file, model, "en")?.stanceLabel).toBe(
      label,
    );
  });
});

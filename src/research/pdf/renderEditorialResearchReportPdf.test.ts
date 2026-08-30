import { describe, expect, it } from "vitest";
import { researchReportToFile } from "../researchReportToFile";
import { workflowV3PresentationFixture } from "../workflowV3Presentation.testSupport";
import { buildResearchFilePdfDocument } from "./renderEditorialResearchReportPdf";

function serialized(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(serialized).join("");
  if (typeof value === "object" && value !== null)
    return Object.values(value).map(serialized).join("");
  return "";
}

const states = [
  ["upside_skewed", "Upside skewed"],
  ["downside_skewed", "Downside skewed"],
  ["balanced", "Balanced"],
  ["insufficient_evidence", "Insufficient evidence"],
] as const;

describe("workflow-v3 editorial PDF", () => {
  it.each(states)(
    "renders %s with the canonical public label",
    (stance, label) => {
      const source = workflowV3PresentationFixture("en");
      const report = {
        ...source,
        editorialDecision: { ...source.editorialDecision, stance },
      };
      const file = researchReportToFile(report, "2026-08-29T00:00:00.000Z");
      const document = buildResearchFilePdfDocument({
        file,
        symbol: "TEST",
        locale: "en",
        createdAt: "2026-08-29T00:00:00.000Z",
        version: report.version,
      });
      expect(serialized(document.content)).toContain(label);
    },
  );
});

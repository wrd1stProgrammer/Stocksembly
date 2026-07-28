import { describe, expect, it } from "vitest";
import { ResearchReportSchema } from "../domain/report";
import { validReport } from "../domain/report.testSupport";
import { renderResearchReportPdf } from "./researchReportPdf";

describe("research report PDF", () => {
  it("renders a compact five-page downloadable investment research document", async () => {
    const bytes = await renderResearchReportPdf({
      report: ResearchReportSchema.parse(validReport()),
      symbol: "NVDA",
      locale: "ko",
      createdAt: "2026-07-23T06:00:00.000Z",
    });
    const content = bytes.toString("latin1");
    expect(content.startsWith("%PDF-")).toBe(true);
    expect(content.match(/\/Type\s*\/Page\b/g)).toHaveLength(5);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  }, 20_000);
});

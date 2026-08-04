import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchReportSchema } from "../domain/report";
import { validReport } from "../domain/report.testSupport";

const renderEditorialResearchReportPdf = vi.fn(async () =>
  Buffer.from("%PDF-production-characterization"),
);

vi.mock("./renderEditorialResearchReportPdf", () => ({
  renderEditorialResearchReportPdf,
}));

describe("production PDF renderer selection", () => {
  beforeEach(() => renderEditorialResearchReportPdf.mockClear());

  it("routes the production facade exclusively to the editorial pdfmake renderer", async () => {
    const { renderResearchReportPdf } = await import("./researchReportPdf");
    const report = ResearchReportSchema.parse(validReport());
    const props = {
      report,
      symbol: "NVDA",
      locale: "ko" as const,
      createdAt: "2026-07-23T06:00:00.000Z",
    };

    const bytes = await renderResearchReportPdf(props);

    expect(bytes.toString()).toBe("%PDF-production-characterization");
    expect(renderEditorialResearchReportPdf).toHaveBeenCalledTimes(1);
    expect(renderEditorialResearchReportPdf).toHaveBeenCalledWith(props);
  });
});

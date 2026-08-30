import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowV3PresentationFixture } from "@/src/research/workflowV3Presentation.testSupport";

const mocks = vi.hoisted(() => ({
  render: vi.fn(async () => Buffer.from("%PDF-v3")),
  handle: vi.fn(),
}));

vi.mock("@/src/research/pdf/renderEditorialResearchReportPdf", () => ({
  renderEditorialResearchReportPdf: mocks.render,
}));
vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({ handle: mocks.handle }),
}));

describe("workflow-v3 report PDF route", () => {
  beforeEach(() => {
    mocks.render.mockClear();
    mocks.handle.mockReset();
  });

  it("passes the canonical v3 report to the v3-capable renderer", async () => {
    const report = workflowV3PresentationFixture("ko");
    mocks.handle.mockImplementation(async (request: Request) =>
      new URL(request.url).pathname.includes("/runs/")
        ? Response.json({
            run: {
              symbol: "TEST",
              createdAt: "2026-08-29T00:00:00.000Z",
            },
          })
        : Response.json({ report }),
    );
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/research/reports/id/pdf?lang=ko"),
      { params: Promise.resolve({ reportId: report.reportId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({ report, locale: "ko", symbol: "TEST" }),
    );
    expect(await response.text()).toBe("%PDF-v3");
  });
});

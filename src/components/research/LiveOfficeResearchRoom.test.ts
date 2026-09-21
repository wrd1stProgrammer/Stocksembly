import { afterEach, expect, it, vi } from "vitest";
import { workflowV2PresentationFixture } from "../../research/workflowV2Presentation.testSupport";
import {
  formatResearchHistoryDate,
  loadReport,
  shouldScopeDepartmentOffice,
} from "./LiveOfficeResearchRoom";

vi.mock("../../auth/researchSession", () => ({
  currentAuthTokens: vi
    .fn()
    .mockResolvedValue({ accessToken: "access", identityToken: "identity" }),
  syncResearchSession: vi.fn().mockResolvedValue(true),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("loads a workflow-v2 report returned by the public API", async () => {
  const report = workflowV2PresentationFixture();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ report })));

  await expect(loadReport(report.reportId, 0)).resolves.toMatchObject({
    report: { schemaVersion: "workflow-v2", reportId: report.reportId },
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(report.reportId),
    expect.objectContaining({
      headers: {
        authorization: "Bearer access",
        "x-stocksembly-identity-token": "identity",
      },
    }),
  );
});

it("restores a lost server session before retrying the published report", async () => {
  vi.useFakeTimers();
  const report = workflowV2PresentationFixture();
  vi.stubGlobal("window", { setTimeout });
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ report }));
  vi.stubGlobal("fetch", request);
  const result = loadReport(report.reportId, 1);
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({
    report: { reportId: report.reportId },
  });
  const { syncResearchSession } = await import("../../auth/researchSession");
  expect(syncResearchSession).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
});

it("formats compact research history dates", () => {
  const createdAt = "2026-07-31T21:55:00.000Z";

  expect(formatResearchHistoryDate(createdAt, "ko")).toBe("26.07.31");
  expect(formatResearchHistoryDate(createdAt, "en")).toBe("07.31.26");
});

it("opens a department run to the five-person forum for the chair stage", () => {
  const target = { kind: "department", departmentId: "financial" } as const;

  expect(shouldScopeDepartmentOffice(target, "return-b")).toBe(true);
  expect(shouldScopeDepartmentOffice(target, "representative-gathering")).toBe(
    false,
  );
  expect(shouldScopeDepartmentOffice(target, "forum")).toBe(false);
});

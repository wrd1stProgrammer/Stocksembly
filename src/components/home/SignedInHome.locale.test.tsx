import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LandingResearchRoomPreviewData } from "../researchRoom/landingResearchRoomPreviewSelection";
import { SignedInHome } from "./SignedInHome";

vi.mock("../../auth/researchClient", () => ({
  createAuthenticatedResearchClient: () => ({
    bootstrapSession: async () => {},
    listRuns: async () => [],
  }),
}));
vi.mock("../SearchConsole", () => ({ SearchConsole: () => null }));
afterEach(() => vi.unstubAllGlobals());
it("switches community questions to stored translations and restores the initial language", async () => {
  const preview: LandingResearchRoomPreviewData = {
    companyNames: {},
    reports: [
      {
        reportId: "report-1",
        symbol: "NVDA",
        question: "Can growth continue?",
        locale: "en",
        publishedAt: "2026-09-01T00:00:00.000Z",
        status: "complete",
        viewCount: 0,
        locked: false,
        researchTarget: { kind: "committee" },
      },
    ],
  };
  const fetcher = vi.fn(async () =>
    Response.json({
      ...preview,
      reports: preview.reports.map((report) => ({
        ...report,
        question: "성장이 지속될까요?",
      })),
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const props = {
    initialLocale: "en" as const,
    communityPreview: preview,
    onOpenPlans: () => {},
    subscriptionTier: "free" as const,
  };
  const { rerender } = render(<SignedInHome {...props} locale="en" />);
  expect(screen.getByText("Can growth continue?")).toBeVisible();
  rerender(<SignedInHome {...props} locale="ko" />);
  expect(await screen.findByText("성장이 지속될까요?")).toBeVisible();
  expect(screen.queryByText("Can growth continue?")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/research-room/preview?lang=ko",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  rerender(<SignedInHome {...props} locale="en" />);
  expect(screen.getByText("Can growth continue?")).toBeVisible();
});

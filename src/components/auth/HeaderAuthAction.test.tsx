import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getCurrentUser } from "aws-amplify/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import { HeaderAuthAction } from "./HeaderAuthAction";

vi.mock("aws-amplify/auth", () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../auth/amplifyClient", () => ({
  configureAmplifyAuth: () => true,
}));

vi.mock("../../auth/researchSession", () => ({
  clearResearchSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth/researchClient", () => ({
  createAuthenticatedResearchClient: vi.fn(),
}));

describe("HeaderAuthAction", () => {
  const bootstrapSession = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    bootstrapSession.mockClear();
    vi.mocked(getCurrentUser).mockResolvedValue({
      username: "member",
      userId: "member-id",
    });
    vi.mocked(createAuthenticatedResearchClient).mockReturnValue({
      bootstrapSession,
      startRun: vi.fn(),
      getRun: vi.fn(),
      cancelRun: vi.fn(),
      retryRun: vi.fn(),
      followUp: vi.fn(),
      askQuestion: vi.fn(),
      getQuestion: vi.fn(),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: "00000000-0000-4000-8000-000000000001",
          snapshotId: "00000000-0000-4000-8000-000000000002",
          symbol: "NVDA",
          locale: "ko",
          status: "completed",
          lastEventSeq: 12,
          createdAt: "2026-07-28T10:00:00.000Z",
          reportId: "00000000-0000-4000-8000-000000000003",
        },
      ]),
    });
  });

  it("opens the signed-in user's recent research and links to the stored run", async () => {
    render(<HeaderAuthAction label="Get started" locale="ko" />);

    const trigger = await screen.findByRole("button", {
      name: "최근 리서치 열기",
    });
    fireEvent.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "최근 분석" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("NVDA")).toBeVisible());
    expect(bootstrapSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /NVDA · 완료/u })).toHaveAttribute(
      "href",
      "/research/NVDA?run=00000000-0000-4000-8000-000000000001&lang=ko",
    );
  });
});

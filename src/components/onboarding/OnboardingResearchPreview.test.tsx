import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OfficePresentation } from "../../research/officeDialogue";
import sample from "../../research/server/onboarding/sample-research.json";
import { OnboardingResearchPreview } from "./OnboardingResearchPreview";
import { ONBOARDING_RESEARCH_KEY } from "./onboardingJourney";

vi.mock("../../research/liveOfficeAnimation", () => ({
  useLiveOfficeAnimation: () => ({}),
}));
vi.mock("../research/OfficeStage", () => ({
  OfficeStage: ({
    presentation,
    isPaused,
    isComplete,
    headingActions,
  }: {
    presentation: OfficePresentation;
    isPaused: boolean;
    isComplete: boolean;
    headingActions: ReactNode;
  }) =>
    isComplete ? (
      <div>Report backdrop</div>
    ) : (
      <>
        {headingActions}
        <button
          type="button"
          data-testid="office"
          data-rate={presentation.playbackRate}
          data-paused={isPaused}
          onClick={() =>
            presentation.onChange({
              id: presentation.event?.id ?? "",
              status: "finished",
            })
          }
        >
          Finish speech
        </button>
      </>
    ),
}));
vi.mock("../research/MeetingMinutes", () => ({
  MeetingMinutes: () => <div>Minutes</div>,
}));
vi.mock("../research/ResearchSidebar", () => ({
  ResearchSidebar: () => <div>Original sidebar</div>,
}));
vi.mock("../billing/SidebarSubscriptionModal", () => ({
  SidebarSubscriptionModal: ({ open }: { open: boolean }) =>
    open ? <div>Plan choices</div> : null,
}));
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  sessionStorage.setItem(
    ONBOARDING_RESEARCH_KEY,
    JSON.stringify({
      stock: {
        symbol: "NVDA",
        providerCode: "NASDAQ:NVDA",
        company: "NVIDIA",
        exchange: "NASDAQ",
      },
      question: "Is growth sustainable?",
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(sample)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("plays the actual sample with pause and speed, then skips to the blurred report and existing paywall", async () => {
  render(<OnboardingResearchPreview locale="ko" />);
  const office = await screen.findByTestId("office");
  expect(screen.getByText("Original sidebar")).toBeVisible();
  expect(office).toHaveAttribute("data-rate", "2");
  fireEvent.click(screen.getByRole("button", { name: "Playback speed" }));
  expect(office).toHaveAttribute("data-rate", "4");
  fireEvent.click(screen.getByRole("button", { name: "Playback speed" }));
  expect(office).toHaveAttribute("data-rate", "1");
  fireEvent.click(screen.getByRole("button", { name: "Playback speed" }));
  expect(office).toHaveAttribute("data-rate", "2");
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  expect(office).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
  expect(screen.getByText("내 질문으로 새 리서치를 시작하세요")).toBeVisible();
  expect(document.querySelector(".onboarding-preview")).toHaveAttribute(
    "inert",
  );
  fireEvent.click(screen.getByRole("button", { name: "확인하기" }));
  expect(screen.getByText("Plan choices")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/onboarding/demo?symbol=NVDA"),
    expect.any(Object),
  );
});

it("reaches the paywall after every projected speech finishes without starting a paid run", async () => {
  render(<OnboardingResearchPreview locale="ko" />);
  await screen.findByTestId("office");
  let completed = 0;
  while (screen.queryByTestId("office") && completed < 100) {
    fireEvent.click(screen.getByTestId("office"));
    completed++;
  }
  expect(completed).toBeGreaterThan(20);
  expect(completed).toBeLessThan(100);
  expect(screen.getByText("내 질문으로 새 리서치를 시작하세요")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("offers retry after a loading failure", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  render(<OnboardingResearchPreview locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByTestId("office")).toBeVisible();
});

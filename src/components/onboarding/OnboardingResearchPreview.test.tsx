import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { OnboardingResearchPreview } from "./OnboardingResearchPreview";
import { ONBOARDING_RESEARCH_KEY } from "./onboardingJourney";

vi.mock("../research/OfficeStage", () => ({
  OfficeStage: ({
    onOfficeReady,
    isPaused,
  }: {
    onOfficeReady: () => void;
    isPaused: boolean;
  }) => {
    useEffect(onOfficeReady, [onOfficeReady]);
    return <div data-testid="office" data-paused={isPaused} />;
  },
}));
vi.mock("../research/MeetingMinutes", () => ({
  MeetingMinutes: () => <div>Minutes</div>,
}));
vi.mock("../research/ResearchSidebar", () => ({ ResearchSidebar: () => null }));
vi.mock("../billing/SidebarSubscriptionModal", () => ({
  SidebarSubscriptionModal: ({ open }: { open: boolean }) =>
    open ? <div>Plan choices</div> : null,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("finishes the entrance, freezes the preview and opens plans without starting research", () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
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
  render(<OnboardingResearchPreview locale="ko" />);
  expect(screen.getByTestId("office")).toHaveAttribute("data-paused", "false");
  act(() => vi.advanceTimersByTime(6500));
  expect(screen.getByTestId("office")).toHaveAttribute("data-paused", "true");
  expect(
    screen.getByText("전체 에이전트 리서치는 10크레딧이 필요해요"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "플랜 확인하기" }));
  expect(screen.getByText("Plan choices")).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});

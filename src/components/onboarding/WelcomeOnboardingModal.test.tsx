import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhopPricingPlan } from "../../lib/whop/contracts";
import { WelcomeOnboardingModal } from "./WelcomeOnboardingModal";

const plans: readonly WhopPricingPlan[] = [
  {
    key: "pro-monthly",
    tier: "Pro",
    amount: 19,
    interval: "month",
    planId: "plan_pro_monthly",
    purchaseUrl: "https://example.com/pro-monthly",
  },
  {
    key: "pro-annual",
    tier: "Pro",
    amount: 190,
    interval: "year",
    planId: "plan_pro_annual",
    purchaseUrl: "https://example.com/pro-annual",
  },
  {
    key: "ultra-monthly",
    tier: "Ultra",
    amount: 39,
    interval: "month",
    planId: "plan_ultra_monthly",
    purchaseUrl: "https://example.com/ultra-monthly",
  },
  {
    key: "ultra-annual",
    tier: "Ultra",
    amount: 390,
    interval: "year",
    planId: "plan_ultra_annual",
    purchaseUrl: "https://example.com/ultra-annual",
  },
];

vi.mock("../../auth/researchSession", () => ({
  currentAuthTokens: async () => ({}),
}));
async function chooseStock() {
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  fireEvent.change(
    screen.getByRole("textbox", { name: "회사명 또는 종목 코드 검색" }),
    { target: { value: "NVDA" } },
  );
  fireEvent.click(await screen.findByRole("button", { name: /NVDA/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByRole("heading", { name: "어떤 점이 궁금하세요?" });
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "나의 투자 질문" }), {
    target: { value: "성장세가 현재 주가를 정당화할까요?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByRole("heading", {
    name: "어떤 투자 판단부터 선명하게 만들까요?",
  });
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      Response.json(
        input.includes("tickers")
          ? {
              tickers: [
                {
                  symbol: "NVDA",
                  providerCode: "NASDAQ:NVDA",
                  company: "NVIDIA",
                  exchange: "NASDAQ",
                },
              ],
            }
          : { status: "accepted" },
        { status: input.includes("tickers") ? 200 : 202 },
      ),
    ),
  );

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("WelcomeOnboardingModal", () => {
  it("collects stock, question and survey before offering the sample or home", async () => {
    const onComplete = vi.fn();
    const onOpenPlans = vi.fn();
    render(
      <WelcomeOnboardingModal
        locale="ko"
        plans={plans}
        onComplete={onComplete}
        onOpenPlans={onOpenPlans}
      />,
    );

    await chooseStock();
    expect(
      screen.getByRole("heading", {
        name: "어떤 투자 판단부터 선명하게 만들까요?",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /실적 발표 전에/u }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(
      screen.getByRole("heading", {
        name: "Stocksembly를 어디서 알게 되셨나요?",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "인스타그램" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByRole("heading", { name: "샘플 리서치" })).toBeVisible();
    expect(screen.getByRole("button", { name: /NVDA\s*재생/ })).toBeEnabled();
    expect(screen.queryByText("10크레딧")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "홈으로" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("instagram"));
    expect(onOpenPlans).not.toHaveBeenCalled();
  });

  it("does not require pricing data before the sample", async () => {
    render(
      <WelcomeOnboardingModal
        locale="ko"
        plans={[]}
        preview
        onComplete={vi.fn()}
        onOpenPlans={vi.fn()}
      />,
    );
    await chooseStock();
    fireEvent.click(screen.getByRole("button", { name: /실적 발표 전에/u }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "구글" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: /NVDA\s*재생/ })).toBeEnabled();
  });
});

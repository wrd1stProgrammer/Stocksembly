import { fireEvent, render, screen } from "@testing-library/react";
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

beforeEach(() => {
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
  it("collects discovery source before explaining credits and billing plans", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "소셜 미디어" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByText("가입 선물 5크레딧이 준비됐어요")).toBeVisible();
    expect(screen.getByText("리서치룸 열람")).toBeVisible();
    expect(screen.getByText("3크레딧")).toBeVisible();
    expect(screen.getByText("전문 번역")).toBeVisible();
    expect(screen.getByText("1크레딧")).toBeVisible();
    expect(screen.getByText("개별 팀 리서치")).toBeVisible();
    expect(screen.getByText("5크레딧")).toBeVisible();
    expect(screen.getByText("전체 위원회 리서치")).toBeVisible();
    expect(screen.getByText("10크레딧")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "요금제 보기" }));

    expect(
      screen.getByRole("heading", { name: "더 깊게 볼 땐, 두 달을 아끼세요" }),
    ).toBeVisible();
    const pro = document.querySelector('[data-plan="pro"]');
    const ultra = document.querySelector('[data-plan="ultra"]');
    expect(pro).toHaveTextContent("$190 연간 결제");
    expect(pro).toHaveTextContent("$15.83");
    expect(pro).toHaveTextContent("150크레딧");
    expect(ultra).toHaveTextContent("$390 연간 결제");
    expect(ultra).toHaveTextContent("$32.5");
    expect(ultra).toHaveTextContent("400크레딧");

    fireEvent.click(screen.getByRole("button", { name: "월간" }));
    expect(pro).toHaveTextContent("월간 결제");
    expect(pro).toHaveTextContent("$19");
    expect(ultra).toHaveTextContent("$39");

    fireEvent.click(screen.getByRole("button", { name: /연간/u }));
    expect(pro).toHaveTextContent("$190 연간 결제");

    fireEvent.click(screen.getByRole("button", { name: "전체 요금제 비교" }));
    expect(onOpenPlans).toHaveBeenCalledWith("social");

    fireEvent.click(screen.getByRole("button", { name: "5크레딧으로 시작" }));
    expect(onComplete).toHaveBeenCalledWith("social");
  });

  it("keeps the advertised annual prices visible while live plan data loads", () => {
    render(
      <WelcomeOnboardingModal
        locale="ko"
        plans={[]}
        onComplete={vi.fn()}
        onOpenPlans={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /실적 발표 전에/u }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "요금제 보기" }));

    expect(document.querySelector('[data-plan="pro"]')).toHaveTextContent(
      "$190 연간 결제",
    );
    expect(document.querySelector('[data-plan="ultra"]')).toHaveTextContent(
      "$390 연간 결제",
    );
  });
});

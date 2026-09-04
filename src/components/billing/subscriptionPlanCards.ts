import type { Locale } from "../../lib/i18n";
import type { WhopPricingPlan } from "../../lib/whop/contracts";
import { billingCheckoutPath } from "../../lib/whop/contracts";
import {
  MONTHLY_CREDIT_ALLOWANCE,
  PAID_PLAN_PRICES,
} from "../../lib/whop/creditPolicy";
import type { PricingCardPlan as SubscriptionPlanCard } from "../ui/pricing-card";

export function subscriptionPlanCards(
  plans: readonly WhopPricingPlan[],
  locale: Locale,
): readonly SubscriptionPlanCard[] {
  const lookup = new Map(plans.map((plan) => [plan.key, plan]));
  const plan = (key: WhopPricingPlan["key"]) => lookup.get(key);
  const checkoutUrl = (key: WhopPricingPlan["key"]) => billingCheckoutPath(key);

  return [
    {
      id: "free",
      name: "Free",
      creditAllowance: 5,
      description:
        locale === "ko"
          ? "가볍게 시작하고, 필요한 순간에 리서치를 확인하세요."
          : "Start lightly and check in when research matters.",
      monthlyAmount: 0,
      annualAmount: 0,
      priceLabel: "Free",
      features:
        locale === "ko"
          ? [
              "가입 시 5크레딧 1회 제공",
              "최신 리서치 1회 열람 + 전문 번역 1회",
              "기본 리서치 결과",
              "공개 리서치 아카이브",
            ]
          : [
              "5 credits once at sign-up",
              "One recent report view + one professional translation",
              "Core research results",
              "Public research archive",
            ],
    },
    {
      id: "pro",
      name: "Pro",
      creditAllowance: MONTHLY_CREDIT_ALLOWANCE.pro,
      description:
        locale === "ko"
          ? "더 깊은 검증과 반복 리서치를 위한 전체 리서치룸입니다."
          : "The full research room for deeper, repeatable decisions.",
      monthlyAmount: plan("pro-monthly")?.amount ?? PAID_PLAN_PRICES.pro.month,
      annualAmount: plan("pro-annual")?.amount ?? PAID_PLAN_PRICES.pro.year,
      originalMonthlyAmount:
        plan("pro-monthly")?.amount ?? PAID_PLAN_PRICES.pro.month,
      monthlyCheckoutUrl: checkoutUrl("pro-monthly"),
      annualCheckoutUrl: checkoutUrl("pro-annual"),
      featured: true,
      badge: locale === "ko" ? "추천" : "Popular",
      discount: locale === "ko" ? "2개월 무료" : "Save 2 mo",
      highlight: locale === "ko" ? "가장 인기" : "Best value",
      features:
        locale === "ko"
          ? [
              "리서치할 때 분석 옵션 선택",
              "7일 지난 리서치 무료 열람",
              "관심종목 3개 매일 AI 브리핑",
              "11개 전문 에이전트 분석",
              "가치평가·촉매·리스크 브리프",
            ]
          : [
              "Choose analysis options for each research run",
              "Free access to research after 7 days",
              "Daily AI briefings for 3 watchlist names",
              "11 specialist-agent analyses",
              "Valuation, catalysts, and risk briefs",
            ],
    },
    {
      id: "ultra",
      name: "Ultra",
      creditAllowance: MONTHLY_CREDIT_ALLOWANCE.ultra,
      description:
        locale === "ko"
          ? "가장 넓은 액세스와 신기능 우선 공개를 제공합니다."
          : "The widest access, with early access to what comes next.",
      monthlyAmount:
        plan("ultra-monthly")?.amount ?? PAID_PLAN_PRICES.ultra.month,
      annualAmount: plan("ultra-annual")?.amount ?? PAID_PLAN_PRICES.ultra.year,
      originalMonthlyAmount:
        plan("ultra-monthly")?.amount ?? PAID_PLAN_PRICES.ultra.month,
      monthlyCheckoutUrl: checkoutUrl("ultra-monthly"),
      annualCheckoutUrl: checkoutUrl("ultra-annual"),
      features:
        locale === "ko"
          ? [
              "Pro의 모든 기능",
              "관심종목 10개 매일 AI 브리핑",
              "신기능 우선 공개",
              "심층 후속 질문과 검증",
              "우선 처리 큐",
            ]
          : [
              "Everything in Pro",
              "Daily AI briefings for 10 watchlist names",
              "Early access to new features",
              "Deeper follow-up questions and verification",
              "Priority processing queue",
            ],
    },
  ];
}

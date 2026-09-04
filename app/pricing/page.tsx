import "@/src/styles/billing.css";
import type { Metadata } from "next";
import { PublicPricingGrid } from "@/src/components/billing/PublicPricingGrid";
import { researchLocaleFromValue } from "@/src/lib/i18n";
import { getWhopEnvironment, getWhopPricing } from "@/src/lib/whop/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "요금제",
  description: "Stocksembly Pro와 Ultra 구독 요금제",
};

type Props = {
  readonly searchParams: Promise<{ readonly lang?: string }>;
};

const planCopy = {
  en: {
    eyebrow: "Stocksembly membership",
    title: "Choose your research depth.",
    description:
      "Unlock the freshest research room reports and keep the full debate close at hand.",
    monthly: "Monthly",
    annual: "Annual",
    perMonth: "/ month",
    perYear: "/ year",
    choose: "Continue to checkout",
    checkoutError: "We could not open checkout. Please try again.",
    sandbox: "Sandbox test checkout",
    unavailable: "Sandbox billing is not available right now.",
    pro: "Core research access for everyday decisions.",
    ultra: "Deeper access for investors who want the full edge.",
  },
  ko: {
    eyebrow: "Stocksembly 멤버십",
    title: "원하는 리서치 깊이를 선택하세요.",
    description:
      "최신 리서치룸과 전체 토론 기록을 가장 먼저 확인할 수 있습니다.",
    monthly: "월간",
    annual: "연간",
    perMonth: "/ 월",
    perYear: "/ 년",
    choose: "결제 화면으로 이동",
    checkoutError: "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
    sandbox: "Sandbox 테스트 결제",
    unavailable: "현재 Sandbox 결제를 사용할 수 없습니다.",
    pro: "일상적인 투자 판단을 위한 핵심 리서치 액세스.",
    ultra: "더 깊은 검증과 전체 논의를 원하는 투자자를 위한 플랜.",
  },
} as const;

export default async function PricingPage({ searchParams }: Props) {
  const query = await searchParams;
  const locale = researchLocaleFromValue(query.lang);
  const copy = planCopy[locale];
  const environment = getWhopEnvironment();
  const plans = await getWhopPricing().catch(() => []);

  return (
    <main className="billing-page" lang={locale}>
      <div className="billing-page__shell">
        <header className="billing-page__header">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.description}</span>
          {environment === "sandbox" ? <small>{copy.sandbox}</small> : null}
        </header>

        {plans.length === 0 ? (
          <p className="billing-page__unavailable" role="alert">
            {copy.unavailable}
          </p>
        ) : (
          <PublicPricingGrid plans={plans} locale={locale} copy={copy} />
        )}
      </div>
    </main>
  );
}

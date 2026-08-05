"use client";

import { CheckCircle2, ExternalLink, X } from "lucide-react";
import { type CSSProperties, useEffect, useId, useMemo, useRef } from "react";
import type { Locale } from "../../lib/i18n";
import type {
  BillingCreditActivity,
  WhopBillingStatus,
  WhopPricingPlan,
} from "../../lib/whop/contracts";
import { CharSpringMorph } from "../ui/char-spring-morph";
import { DotsRing } from "../ui/dots-ring";
import {
  PricingPlansGrid,
  type SubscriptionPlanCard,
} from "./PricingPlansGrid";

type SubscriptionModalProps = {
  readonly open: boolean;
  readonly locale: Locale;
  readonly subscriptionTier: "unknown" | "free" | "paid";
  readonly plans: readonly WhopPricingPlan[];
  readonly billingStatus: WhopBillingStatus | undefined;
  readonly loading: boolean;
  readonly error: boolean;
  readonly onClose: () => void;
};

function CreditMeter({
  locale,
  billingStatus,
}: {
  readonly locale: Locale;
  readonly billingStatus: WhopBillingStatus | undefined;
}) {
  const titleId = useId();
  const usage = billingStatus?.credits;
  const usageAvailable = usage !== undefined;
  const meterStyle = {
    "--credit-used": `${usage?.usedPercent ?? 0}%`,
  } as CSSProperties;

  return (
    <section
      className="subscription-credit-meter"
      aria-labelledby={titleId}
      style={meterStyle}
    >
      <div className="subscription-credit-meter__header">
        <h3 id={titleId}>
          <strong>
            {usageAvailable ? (
              <CharSpringMorph
                value={usage.remaining.toLocaleString(
                  locale === "ko" ? "ko-KR" : "en-US",
                )}
                className="subscription-credit-meter__value"
                animateOnMount
              />
            ) : (
              "—"
            )}
          </strong>
          <span>
            {usageAvailable
              ? locale === "ko"
                ? "크레딧 남음"
                : "credits left"
              : locale === "ko"
                ? "크레딧 확인 필요"
                : "credits unavailable"}
          </span>
        </h3>
        <span>
          {usageAvailable
            ? `${usage.usedPercent}% ${locale === "ko" ? "사용함" : "used"}`
            : locale === "ko"
              ? "결제 상태 확인 필요"
              : "Billing status unavailable"}
        </span>
      </div>
      <div
        className="subscription-credit-meter__track"
        role="progressbar"
        aria-label={locale === "ko" ? "크레딧 사용량" : "Credit usage"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usage?.usedPercent ?? 0}
        aria-valuetext={
          usageAvailable
            ? `${usage.usedPercent}% ${locale === "ko" ? "사용함" : "used"}`
            : locale === "ko"
              ? "결제 상태 확인 필요"
              : "Billing status unavailable"
        }
      >
        <span aria-hidden="true" />
      </div>
    </section>
  );
}

function formatBillingDate(value: string | undefined, locale: Locale): string {
  if (value === undefined) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function SubscriptionOverview({
  locale,
  plans,
  billingStatus,
}: {
  readonly locale: Locale;
  readonly plans: readonly WhopPricingPlan[];
  readonly billingStatus: WhopBillingStatus | undefined;
}) {
  const titleId = useId();
  const tier =
    billingStatus?.tier === "ultra"
      ? "Ultra"
      : billingStatus?.tier === "pro"
        ? "Pro"
        : "Free";
  const plan =
    (billingStatus?.planKey
      ? plans.find((candidate) => candidate.key === billingStatus.planKey)
      : undefined) ??
    (billingStatus?.planId
      ? plans.find((candidate) => candidate.planId === billingStatus.planId)
      : undefined);
  const cycle =
    plan?.interval === "year" || billingStatus?.planKey?.endsWith("-annual")
      ? locale === "ko"
        ? "연간 결제"
        : "Annual billing"
      : plan?.interval === "month" ||
          billingStatus?.planKey?.endsWith("-monthly")
        ? locale === "ko"
          ? "월간 결제"
          : "Monthly billing"
        : "—";
  const amount = plan
    ? `$${plan.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "—";
  const paymentPeriodStart =
    billingStatus?.currentPeriodStart ?? billingStatus?.credits.periodStart;
  const paymentPeriodEnd =
    billingStatus?.currentPeriodEnd ?? billingStatus?.credits.periodEnd;
  const statusCopy =
    billingStatus?.status === "past_due"
      ? locale === "ko"
        ? "결제 확인 필요"
        : "Payment issue"
      : billingStatus?.status === "trialing"
        ? locale === "ko"
          ? "체험 중"
          : "Trial"
        : locale === "ko"
          ? "활성"
          : "Active";
  const manageUrl =
    billingStatus?.manageUrl ?? `/pricing?lang=${encodeURIComponent(locale)}`;
  const hasProviderManageUrl = billingStatus?.manageUrl !== undefined;
  const periodCaption = billingStatus?.cancelAtPeriodEnd
    ? locale === "ko"
      ? "플랜 종료 예정"
      : "Plan ends"
    : locale === "ko"
      ? "다음 결제일"
      : "Next payment";

  return (
    <section className="subscription-overview" aria-labelledby={titleId}>
      <header className="subscription-overview__header">
        <div className="subscription-overview__plan-lockup">
          <h3 id={titleId}>{tier}</h3>
          <span className="subscription-overview__period-label">{cycle}</span>
        </div>
        <span
          className={`subscription-overview__status${
            billingStatus?.status === "past_due" ? " is-warning" : ""
          }`}
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          {statusCopy}
        </span>
      </header>

      <div className="subscription-overview__divider" />

      <div className="subscription-overview__payment">
        <div className="subscription-overview__price">
          <span className="subscription-overview__label">
            {locale === "ko" ? "결제 금액" : "Payment"}
          </span>
          <div className="subscription-overview__price-value">
            <strong>
              <CharSpringMorph
                value={amount}
                className="subscription-overview__price-morph"
                animateOnMount
              />
            </strong>
            <span>{cycle}</span>
          </div>
        </div>
        <div className="subscription-overview__period">
          <span className="subscription-overview__label">
            {locale === "ko" ? "결제 기간" : "Billing period"}
          </span>
          <strong>
            {formatBillingDate(paymentPeriodStart, locale)}
            <span aria-hidden="true">—</span>
            {formatBillingDate(paymentPeriodEnd, locale)}
          </strong>
          <small>
            {periodCaption}
            {billingStatus?.currentPeriodEnd
              ? ` ${formatBillingDate(billingStatus.currentPeriodEnd, locale)}`
              : ""}
          </small>
        </div>
      </div>

      <dl className="subscription-overview__facts">
        <div>
          <dt>{locale === "ko" ? "월 제공 크레딧" : "Monthly credits"}</dt>
          <dd>
            <CharSpringMorph
              value={
                billingStatus?.credits.allowance.toLocaleString(
                  locale === "ko" ? "ko-KR" : "en-US",
                ) ?? "—"
              }
              className="subscription-overview__number-morph"
              animateOnMount
            />
            <small>{locale === "ko" ? "크레딧" : "credits"}</small>
          </dd>
        </div>
        <div>
          <dt>{locale === "ko" ? "결제 주기" : "Billing cycle"}</dt>
          <dd>{cycle}</dd>
        </div>
        <div>
          <dt>{locale === "ko" ? "크레딧 기간" : "Credit period"}</dt>
          <dd>
            {formatBillingDate(billingStatus?.credits.periodStart, locale)}
            <small>—</small>
            {formatBillingDate(billingStatus?.credits.periodEnd, locale)}
          </dd>
        </div>
      </dl>

      <a
        className="subscription-overview__manage"
        href={manageUrl}
        {...(hasProviderManageUrl
          ? { target: "_blank", rel: "noreferrer" }
          : {})}
      >
        {locale === "ko" ? "플랜 변경하기" : "Change plan"}
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

function creditActivityLabel(
  activity: BillingCreditActivity,
  locale: Locale,
): string {
  if (locale === "ko") {
    switch (activity.code) {
      case "free_signup_grant":
        return "가입 보너스 크레딧";
      case "free_daily_grant":
        return "출석체크 무료 크레딧";
      case "pro_monthly_grant":
        return "Pro 월 크레딧";
      case "ultra_monthly_grant":
        return "Ultra 월 크레딧";
      case "full_research":
        return "전체 에이전트 리서치";
      case "department_research":
        return "개별팀 에이전트 리서치";
      case "chat_bundle":
        return "채팅 100회 사용";
      case "research_room":
        return "리서치룸 열람";
      case "research_run":
        return "리서치";
      case "consultation":
        return "AI 질문";
    }
  }
  switch (activity.code) {
    case "free_signup_grant":
      return "Sign-up bonus credits";
    case "free_daily_grant":
      return "Daily check-in credits";
    case "pro_monthly_grant":
      return "Pro monthly credits";
    case "ultra_monthly_grant":
      return "Ultra monthly credits";
    case "full_research":
      return "Full-agent research";
    case "department_research":
      return "Department research";
    case "chat_bundle":
      return "100 chat messages";
    case "research_room":
      return "Research Room view";
    case "research_run":
      return "Research run";
    case "consultation":
      return "AI question";
  }
}

function creditActivityDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function CreditActivity({
  activities,
  loading,
  locale,
  title,
}: {
  readonly activities: readonly BillingCreditActivity[];
  readonly loading: boolean;
  readonly locale: Locale;
  readonly title?: string;
}) {
  const titleId = useId();
  return (
    <section className="subscription-credit-activity" aria-labelledby={titleId}>
      <header className="subscription-credit-activity__header">
        <h3 id={titleId}>
          {title ?? (locale === "ko" ? "최근 내역" : "Recent activity")}
        </h3>
        <span>{locale === "ko" ? "최근 10건" : "Last 10"}</span>
      </header>
      {loading ? (
        <div
          className="subscription-credit-activity__loading"
          role="status"
          aria-live="polite"
        >
          <DotsRing />
          <span className="sr-only">
            {locale === "ko" ? "내역 불러오는 중" : "Loading activity"}
          </span>
        </div>
      ) : activities.length === 0 ? (
        <p className="subscription-credit-activity__empty">
          {locale === "ko"
            ? "아직 크레딧 내역이 없습니다."
            : "No credit activity yet."}
        </p>
      ) : (
        <ol className="subscription-credit-activity__list">
          {activities.slice(0, 10).map((activity) => {
            const isGrant = activity.amount > 0;
            return (
              <li
                className={
                  isGrant
                    ? "subscription-credit-activity__item is-grant"
                    : "subscription-credit-activity__item is-usage"
                }
                key={activity.id}
              >
                <span className="subscription-credit-activity__label">
                  {creditActivityLabel(activity, locale)}
                </span>
                <span className="subscription-credit-activity__meta">
                  <strong>
                    {isGrant ? "+" : ""}
                    {activity.amount.toLocaleString()}
                  </strong>
                  <time dateTime={activity.occurredAt}>
                    {creditActivityDate(activity.occurredAt, locale)}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function planCards(
  plans: readonly WhopPricingPlan[],
  locale: Locale,
): readonly SubscriptionPlanCard[] {
  const lookup = new Map(plans.map((plan) => [plan.key, plan]));
  const plan = (key: WhopPricingPlan["key"]) => lookup.get(key);
  const checkoutUrl = (key: WhopPricingPlan["key"]) =>
    `/api/billing/checkout?plan=${encodeURIComponent(key)}`;

  return [
    {
      id: "free",
      name: "Free",
      creditAllowance: 3,
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
              "가입 시 +5 · 출석체크 +3 크레딧 (월 최대 30)",
              "지연된 리서치 결과 열람",
              "기본 리서치 결과",
              "공개 리서치 아카이브",
            ]
          : [
              "+5 at sign-up · +3 check-in (up to 30/month)",
              "View delayed research results",
              "Core research results",
              "Public research archive",
            ],
    },
    {
      id: "pro",
      name: "Pro",
      creditAllowance: 100,
      description:
        locale === "ko"
          ? "더 깊은 검증과 반복 리서치를 위한 전체 리서치룸입니다."
          : "The full research room for deeper, repeatable decisions.",
      monthlyAmount: plan("pro-monthly")?.amount ?? null,
      annualAmount: plan("pro-annual")?.amount ?? null,
      originalMonthlyAmount: plan("pro-monthly")?.amount ?? null,
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
              "리서치룸 무제한 제공",
              "관심종목 3개 매일 AI 브리핑",
              "11개 전문 에이전트 분석",
              "가치평가·촉매·리스크 브리프",
            ]
          : [
              "Choose analysis options for each research run",
              "Unlimited research-room access",
              "Daily AI briefings for 3 watchlist names",
              "11 specialist-agent analyses",
              "Valuation, catalysts, and risk briefs",
            ],
    },
    {
      id: "ultra",
      name: "Ultra",
      creditAllowance: 300,
      description:
        locale === "ko"
          ? "가장 넓은 액세스와 신기능 우선 공개를 제공합니다."
          : "The widest access, with early access to what comes next.",
      monthlyAmount: plan("ultra-monthly")?.amount ?? null,
      annualAmount: plan("ultra-annual")?.amount ?? null,
      originalMonthlyAmount: plan("ultra-monthly")?.amount ?? null,
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

export function SubscriptionModal({
  open,
  locale,
  subscriptionTier,
  plans,
  billingStatus,
  loading,
  error,
  onClose,
}: SubscriptionModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollingTimerRef = useRef<number | undefined>(undefined);
  const isSubscribed = subscriptionTier === "paid";
  const billingStateUnknown = subscriptionTier === "unknown";
  const planCardsForLocale = useMemo(
    () => planCards(plans, locale),
    [locale, plans],
  );

  function handleDialogScroll() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.classList.add("is-scrolling");
    if (scrollingTimerRef.current !== undefined)
      window.clearTimeout(scrollingTimerRef.current);
    scrollingTimerRef.current = window.setTimeout(() => {
      dialog.classList.remove("is-scrolling");
      scrollingTimerRef.current = undefined;
    }, 700);
  }

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    document.body.classList.add("subscription-modal-is-open");
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeFromKeyboard);
      if (scrollingTimerRef.current !== undefined)
        window.clearTimeout(scrollingTimerRef.current);
      dialogRef.current?.classList.remove("is-scrolling");
      document.body.classList.remove("subscription-modal-is-open");
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <dialog
      open
      className="subscription-modal__backdrop"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="subscription-modal__dialog"
        aria-busy={loading}
        onScroll={handleDialogScroll}
      >
        <header className="subscription-modal__header">
          <h2 id={titleId}>{locale === "ko" ? "마이페이지" : "My page"}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="subscription-modal__close"
            aria-label={
              locale === "ko" ? "구독창 닫기" : "Close subscription dialog"
            }
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {billingStateUnknown && loading ? (
          <div
            className="subscription-modal__loading"
            role="status"
            aria-live="polite"
          >
            <DotsRing />
            <span className="sr-only">
              {locale === "ko"
                ? "구독 상태 확인 중"
                : "Checking subscription status"}
            </span>
          </div>
        ) : (
          <>
            <CreditMeter locale={locale} billingStatus={billingStatus} />
            {error && !isSubscribed && !billingStateUnknown ? (
              <p className="subscription-modal__notice is-error" role="alert">
                {locale === "ko"
                  ? "가격 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
                  : "Pricing is unavailable. Please try again in a moment."}
              </p>
            ) : null}

            {isSubscribed ? (
              <CreditActivity
                activities={billingStatus?.recentActivity ?? []}
                loading={loading}
                locale={locale}
                title={locale === "ko" ? "크레딧 사용 내역" : "Credit activity"}
              />
            ) : null}

            {billingStateUnknown ? (
              <p className="subscription-modal__notice" role="alert">
                {locale === "ko"
                  ? "구독 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
                  : "We could not confirm your subscription. Please try again."}
              </p>
            ) : isSubscribed ? (
              <SubscriptionOverview
                locale={locale}
                plans={plans}
                billingStatus={billingStatus}
              />
            ) : (
              <PricingPlansGrid
                plans={planCardsForLocale}
                locale={locale}
                initialCycle="annual"
                onFreeSelect={onClose}
              />
            )}
            {!isSubscribed && !billingStateUnknown ? (
              <CreditActivity
                activities={billingStatus?.recentActivity ?? []}
                loading={loading}
                locale={locale}
              />
            ) : null}
            {!isSubscribed && !billingStateUnknown ? (
              <p className="subscription-modal__footnote">
                {locale === "ko"
                  ? "결제는 Whop의 보안 결제 페이지에서 진행됩니다. 연간 플랜은 연간 총액을 한 번에 결제합니다."
                  : "Checkout is handled securely by Whop. Annual plans are charged as one yearly total."}
              </p>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}

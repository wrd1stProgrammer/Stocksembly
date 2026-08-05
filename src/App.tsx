"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { configureAmplifyAuth } from "./auth/amplifyClient";
import { currentAuthTokens, syncResearchSession } from "./auth/researchSession";
import { CreditGrantModal } from "./components/billing/CreditGrantModal";
import { SubscriptionModal } from "./components/billing/SubscriptionModal";
import { Header } from "./components/Header";
import { LandingOfficePreview } from "./components/LandingOfficePreview";
import { LandingFooter, LandingSections } from "./components/LandingSections";
import { PrismRevealText } from "./components/PrismRevealText";
import { LandingResearchRoomPreview } from "./components/researchRoom/LandingResearchRoomPreview";
import { SearchConsole } from "./components/SearchConsole";
import {
  PREFERRED_LOCALE_STORAGE_KEY,
  SIGNED_IN_SIDEBAR_STORAGE_KEY,
  SignedInSidebar,
} from "./components/SignedInSidebar";
import { StarfallFieldBackground } from "./components/ui/starfall-field";
import type { Locale } from "./lib/i18n";
import { copy } from "./lib/i18n";
import { BILLING_CHANGED_EVENT } from "./lib/whop/billingEvents";
import type {
  WhopBillingStatus,
  WhopPricingPlan,
  WhopPricingResponse,
} from "./lib/whop/contracts";

const CREDIT_NOTICE_SEEN_STORAGE_KEY = "stocksembly:credit-notice-seen";
const LOCAL_DEV_SIGNUP_NOTICE_ID = "local-preview-signup-v2";

async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const tokens = await currentAuthTokens();
  const headers = new Headers(init.headers);
  if (tokens.accessToken !== undefined)
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
  if (tokens.identityToken !== undefined)
    headers.set("x-stocksembly-identity-token", tokens.identityToken);
  return await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers,
  });
}

function isLocalBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  );
}

function localFallbackBillingStatus(): WhopBillingStatus {
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    authenticated: true,
    tier: "free",
    status: "none",
    credits: {
      remaining: 5,
      allowance: 30,
      used: 0,
      usedPercent: 0,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
    recentActivity: [
      {
        id: LOCAL_DEV_SIGNUP_NOTICE_ID,
        kind: "grant",
        code: "free_signup_grant",
        amount: 5,
        occurredAt: now.toISOString(),
      },
    ],
    creditNotice: {
      id: LOCAL_DEV_SIGNUP_NOTICE_ID,
      kind: "signup",
      amount: 5,
      grantedAt: now.toISOString(),
      balance: 5,
    },
  };
}

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [signedIn, setSignedIn] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<
    "unknown" | "free" | "paid"
  >("unknown");
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [billingPlans, setBillingPlans] = useState<readonly WhopPricingPlan[]>(
    [],
  );
  const [billingStatus, setBillingStatus] = useState<
    WhopBillingStatus | undefined
  >();
  const [billingPlansLoading, setBillingPlansLoading] = useState(false);
  const [billingPlansError, setBillingPlansError] = useState(false);
  const [creditGrantNotice, setCreditGrantNotice] =
    useState<WhopBillingStatus["creditNotice"]>();
  const [creditGrantModalOpen, setCreditGrantModalOpen] = useState(false);
  const [creditNoticeOwnerKey, setCreditNoticeOwnerKey] = useState("anonymous");
  const content = copy[locale];

  const applyBillingStatus = useCallback(
    (status: WhopBillingStatus) => {
      if (status.tier === "free") setSubscriptionTier("free");
      if (status.tier === "pro" || status.tier === "ultra")
        setSubscriptionTier("paid");
      const isLocalPreview = isLocalBrowser();
      const localPreviewNotice =
        isLocalPreview && status.tier === "free"
          ? {
              id: LOCAL_DEV_SIGNUP_NOTICE_ID,
              kind: "signup" as const,
              amount: 5,
              grantedAt: new Date().toISOString(),
              balance: Math.max(5, status.credits.remaining),
            }
          : undefined;
      const latestGrant = status.recentActivity.find(
        (activity) =>
          activity.kind === "grant" &&
          (activity.code === "free_signup_grant" ||
            activity.code === "free_daily_grant"),
      );
      const recoveredNotice =
        latestGrant === undefined
          ? undefined
          : {
              id: latestGrant.id,
              kind:
                latestGrant.code === "free_signup_grant"
                  ? ("signup" as const)
                  : ("daily" as const),
              amount: Math.abs(latestGrant.amount),
              grantedAt: latestGrant.occurredAt,
              balance: status.credits.remaining,
            };
      const notice =
        status.creditNotice ?? recoveredNotice ?? localPreviewNotice;
      if (typeof status.credits?.remaining === "number") {
        setBillingStatus(
          status.creditNotice !== undefined || localPreviewNotice === undefined
            ? status
            : {
                ...status,
                credits: {
                  ...status.credits,
                  remaining: Math.max(5, status.credits.remaining),
                  allowance: Math.max(30, status.credits.allowance),
                  usedPercent: Math.min(
                    100,
                    Math.round(
                      (Math.max(0, status.credits.used) /
                        Math.max(30, status.credits.allowance)) *
                        1000,
                    ) / 10,
                  ),
                },
              },
        );
      }
      if (notice === undefined || typeof window === "undefined") return;
      const seenNoticeKey = `${CREDIT_NOTICE_SEEN_STORAGE_KEY}:${creditNoticeOwnerKey}`;
      if (window.localStorage.getItem(seenNoticeKey) === notice.id) return;
      setCreditGrantNotice(notice);
      setCreditGrantModalOpen(true);
    },
    [creditNoticeOwnerKey],
  );

  const closeCreditGrantModal = useCallback(() => {
    const notice = creditGrantNotice;
    if (notice !== undefined)
      window.localStorage.setItem(
        `${CREDIT_NOTICE_SEEN_STORAGE_KEY}:${creditNoticeOwnerKey}`,
        notice.id,
      );
    setCreditGrantModalOpen(false);
  }, [creditGrantNotice, creditNoticeOwnerKey]);

  const refreshBillingStatus = useCallback(async () => {
    if (!signedIn) return;
    const response = await authenticatedFetch("/api/billing/status", {
      cache: "no-store",
    }).catch(() => undefined);
    if (response?.ok !== true) return;
    const status = (await response.json()) as WhopBillingStatus;
    applyBillingStatus(status);
  }, [applyBillingStatus, signedIn]);

  const changeLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, nextLocale);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const openSubscriptionModal = useCallback(() => {
    setSubscriptionModalOpen(true);
    void refreshBillingStatus();
  }, [refreshBillingStatus]);

  const closeSubscriptionModal = useCallback(() => {
    setSubscriptionModalOpen(false);
  }, []);

  useEffect(() => {
    const queryLocale = new URLSearchParams(window.location.search).get("lang");
    const storedLocale = window.localStorage.getItem(
      PREFERRED_LOCALE_STORAGE_KEY,
    );
    const initialLocale =
      queryLocale === "en" || queryLocale === "ko"
        ? queryLocale
        : storedLocale === "en" || storedLocale === "ko"
          ? storedLocale
          : undefined;
    if (initialLocale !== undefined) setLocale(initialLocale);
    setSidebarCollapsed(
      window.localStorage.getItem(SIGNED_IN_SIDEBAR_STORAGE_KEY) === "true",
    );
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    void syncResearchSession()
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/account/preferences", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          readonly locale?: unknown;
        };
        if (active && (payload.locale === "en" || payload.locale === "ko")) {
          changeLocale(payload.locale);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [changeLocale, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setSubscriptionTier("unknown");
      setBillingPlans([]);
      setBillingStatus(undefined);
      setBillingPlansLoading(false);
      setBillingPlansError(false);
      setSubscriptionModalOpen(false);
      setCreditGrantNotice(undefined);
      setCreditGrantModalOpen(false);
      return;
    }

    let active = true;
    setSubscriptionTier("unknown");
    setBillingStatus(undefined);
    setBillingPlansLoading(true);
    setBillingPlansError(false);

    void syncResearchSession()
      .catch(() => undefined)
      .then(() =>
        Promise.all([
          authenticatedFetch("/api/billing/plans"),
          authenticatedFetch("/api/billing/status"),
        ]),
      )
      .then(async ([plansResponse, statusResponse]) => {
        if (!active) return;
        if (plansResponse.ok) {
          const payload = (await plansResponse.json()) as WhopPricingResponse;
          setBillingPlans(payload.plans);
        } else {
          setBillingPlansError(true);
        }
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as WhopBillingStatus;
          applyBillingStatus(status);
        } else if (isLocalBrowser() && statusResponse.status === 503) {
          applyBillingStatus(localFallbackBillingStatus());
        } else {
          setBillingPlansError(true);
        }
      })
      .catch(() => {
        if (!active) return;
        setBillingPlansError(true);
      })
      .finally(() => {
        if (active) setBillingPlansLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyBillingStatus, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const refreshIfActive = async () => {
      if (!active) return;
      await refreshBillingStatus();
    };
    const handleBillingChanged = () => {
      void refreshIfActive();
    };
    window.addEventListener(BILLING_CHANGED_EVENT, handleBillingChanged);
    const interval = window.setInterval(refreshIfActive, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(BILLING_CHANGED_EVENT, handleBillingChanged);
    };
  }, [refreshBillingStatus, signedIn]);

  useEffect(() => {
    if (!configureAmplifyAuth()) return;
    let active = true;
    void getCurrentUser()
      .then((user) => {
        if (active) {
          setCreditNoticeOwnerKey(user.userId || user.username);
          setSignedIn(true);
        }
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const url = new URL(window.location.href);
    const billingReturn = url.searchParams.get("billing");
    if (billingReturn !== "plans" && billingReturn !== "success") return;

    setSubscriptionModalOpen(true);
    for (const key of [
      "billing",
      "receipt_id",
      "payment_id",
      "checkout_status",
      "status",
      "state_id",
    ]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [signedIn]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "en"
        ? "Stocksembly — See the whole company"
        : "Stocksembly — 기업의 전체를 보세요";
  }, [locale]);

  return (
    <div
      className={`app-shell${signedIn ? " app-shell--signed-in" : ""}${
        sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""
      }`}
    >
      <div className="atmosphere" aria-hidden="true">
        <StarfallFieldBackground
          className="atmosphere__starfall"
          starsCount={220}
          starsSize={1.7}
          starsOpacity={0.82}
          starsColor="#f4f4f5"
          glowIntensity={11}
          movementSpeed={0.16}
          mouseInfluence={140}
          gravityStrength={44}
          globalPointerEvents
        />
      </div>
      {signedIn ? (
        <SignedInSidebar
          locale={locale}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onLocaleChange={changeLocale}
          onSignedOut={() => {
            setSidebarCollapsed(false);
            setSignedIn(false);
          }}
          onOpenSubscription={openSubscriptionModal}
          subscriptionTier={subscriptionTier}
        />
      ) : null}
      {signedIn ? null : (
        <Header locale={locale} onLocaleChange={changeLocale} />
      )}
      <main>
        <section className="hero" id="product">
          <div className="hero__copy">
            <p className="hero__eyebrow">{content.hero.eyebrow}</p>
            <h1>
              <span className="hero__title-lead">{content.hero.titleLead}</span>{" "}
              <PrismRevealText
                key={content.hero.titleTail}
                text={content.hero.titleTail}
              />
            </h1>
            <p className="hero__description">
              <span className="hero__description-lead">
                {content.hero.descriptionLead}
              </span>{" "}
              <span className="hero__description-tail">
                {content.hero.descriptionTail}
              </span>
            </p>
          </div>
          <SearchConsole
            locale={locale}
            onOpenPlans={openSubscriptionModal}
            subscriptionTier={subscriptionTier}
            creditsRemaining={billingStatus?.credits.remaining}
          />
          <LandingOfficePreview locale={locale} />
          <LandingResearchRoomPreview
            locale={locale}
            onOpenPlans={openSubscriptionModal}
          />
          <p className="hero__proof">
            <ShieldCheck aria-hidden="true" size={22} />
            {content.hero.proof}
          </p>
        </section>
        <LandingSections locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <SubscriptionModal
        open={subscriptionModalOpen}
        locale={locale}
        subscriptionTier={subscriptionTier}
        plans={billingPlans}
        billingStatus={billingStatus}
        loading={billingPlansLoading}
        error={billingPlansError}
        onClose={closeSubscriptionModal}
      />
      <CreditGrantModal
        locale={locale}
        open={creditGrantModalOpen}
        notice={creditGrantNotice}
        onClose={closeCreditGrantModal}
        onOpenMyPage={openSubscriptionModal}
      />
    </div>
  );
}

"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { configureAmplifyAuth } from "./auth/amplifyClient";
import { syncResearchSession } from "./auth/researchSession";
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
import type {
  WhopBillingStatus,
  WhopPricingPlan,
  WhopPricingResponse,
} from "./lib/whop/contracts";

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
  const content = copy[locale];

  const changeLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(PREFERRED_LOCALE_STORAGE_KEY, nextLocale);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const openSubscriptionModal = useCallback(() => {
    setSubscriptionModalOpen(true);
  }, []);

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
          fetch("/api/billing/plans", { credentials: "same-origin" }),
          fetch("/api/billing/status", { credentials: "same-origin" }),
        ]),
      )
      .then(async ([plansResponse, statusResponse]) => {
        if (!plansResponse.ok) throw new Error("BILLING_PLANS_UNAVAILABLE");
        const payload = (await plansResponse.json()) as WhopPricingResponse;
        if (!active) return;
        setBillingPlans(payload.plans);
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as WhopBillingStatus;
          if (status.tier === "free") setSubscriptionTier("free");
          if (status.tier === "pro" || status.tier === "ultra")
            setSubscriptionTier("paid");
          if (typeof status.credits?.remaining === "number")
            setBillingStatus(status);
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
  }, [signedIn]);

  useEffect(() => {
    if (!configureAmplifyAuth()) return;
    let active = true;
    void getCurrentUser()
      .then(() => {
        if (active) setSignedIn(true);
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      !signedIn ||
      new URLSearchParams(window.location.search).get("billing") !== "plans"
    )
      return;
    setSubscriptionModalOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
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
          <SearchConsole locale={locale} />
          <LandingOfficePreview locale={locale} />
          <LandingResearchRoomPreview locale={locale} />
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
        subscriptionTier={subscriptionTier === "paid" ? "paid" : "free"}
        plans={billingPlans}
        billingStatus={billingStatus}
        loading={billingPlansLoading}
        error={billingPlansError}
        onClose={closeSubscriptionModal}
      />
    </div>
  );
}

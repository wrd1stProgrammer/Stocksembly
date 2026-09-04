"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { configureAmplifyAuth } from "./auth/amplifyClient";
import {
  applyLocalePreference,
  PREFERRED_LOCALE_STORAGE_KEY,
  persistAccountLocale,
} from "./auth/localePreference";
import { currentAuthTokens, syncResearchSession } from "./auth/researchSession";
import { Header } from "./components/Header";
import { LandingOfficePreview } from "./components/LandingOfficePreview";
import { LandingFooter, LandingSections } from "./components/LandingSections";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { PrismRevealText } from "./components/PrismRevealText";
import { LandingResearchRoomPreview } from "./components/researchRoom/LandingResearchRoomPreview";
import {
  EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
  type LandingResearchRoomPreviewData,
} from "./components/researchRoom/landingResearchRoomPreviewSelection";
import { SearchConsole } from "./components/SearchConsole";
import {
  SIGNED_IN_SIDEBAR_STORAGE_KEY,
  SignedInSidebar,
} from "./components/SignedInSidebar";
import { SiteAtmosphere } from "./components/SiteAtmosphere";
import type { AppLocale } from "./lib/i18n";
import {
  copy,
  DEFAULT_LOCALE,
  isLocale,
  localeFromCountry,
  localeFromLanguageTag,
  researchLocale,
} from "./lib/i18n";
import { BILLING_CHANGED_EVENT } from "./lib/whop/billingEvents";
import type {
  WhopBillingStatus,
  WhopPricingPlan,
  WhopPricingResponse,
} from "./lib/whop/contracts";

// The subscription modal carries the Whop checkout SDK. It loads only when a
// visitor opens it, so the landing page does not ship that code up front.
const SubscriptionModal = dynamic(
  () =>
    import("./components/billing/SubscriptionModal").then(
      (module) => module.SubscriptionModal,
    ),
  { ssr: false },
);

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

type AppProps = {
  readonly initialLocale?: AppLocale;
  readonly researchRoomPreview?: LandingResearchRoomPreviewData;
};

export function App({
  initialLocale = DEFAULT_LOCALE,
  researchRoomPreview = EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
}: AppProps) {
  const [locale, setLocale] = useState<AppLocale>(initialLocale);
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
  const localeSelectionRevision = useRef(0);
  const content = copy[locale];

  const applyBillingStatus = useCallback((status: WhopBillingStatus) => {
    if (status.tier === "free") setSubscriptionTier("free");
    if (status.tier === "pro" || status.tier === "ultra")
      setSubscriptionTier("paid");
    if (typeof status.credits?.remaining === "number") setBillingStatus(status);
  }, []);

  const refreshBillingStatus = useCallback(async () => {
    if (!signedIn) return;
    const response = await authenticatedFetch("/api/billing/status", {
      cache: "no-store",
    }).catch(() => undefined);
    if (response?.ok !== true) return;
    const status = (await response.json()) as WhopBillingStatus;
    applyBillingStatus(status);
  }, [applyBillingStatus, signedIn]);

  const applyLocale = useCallback((nextLocale: AppLocale) => {
    setLocale(nextLocale);
    applyLocalePreference(nextLocale, { updateUrl: true });
  }, []);

  const selectLocale = useCallback(
    (nextLocale: AppLocale) => {
      localeSelectionRevision.current += 1;
      applyLocale(nextLocale);
      void persistAccountLocale(nextLocale);
    },
    [applyLocale],
  );

  const openSubscriptionModal = useCallback(() => {
    setSubscriptionModalOpen(true);
    void refreshBillingStatus();
  }, [refreshBillingStatus]);

  const closeSubscriptionModal = useCallback(() => {
    setSubscriptionModalOpen(false);
  }, []);

  useEffect(() => {
    const pathLocale = window.location.pathname.split("/")[1];
    const queryLocale = new URLSearchParams(window.location.search).get("lang");
    const storedLocale = window.localStorage.getItem(
      PREFERRED_LOCALE_STORAGE_KEY,
    );
    const country = document.documentElement.dataset["country"];
    const detectedLocale = navigator.languages
      .map(localeFromLanguageTag)
      .find((value): value is AppLocale => value !== undefined);
    const serverLocale = document.documentElement.dataset["locale"];
    const resolvedLocale = isLocale(queryLocale)
      ? queryLocale
      : isLocale(pathLocale)
        ? pathLocale
        : isLocale(storedLocale)
          ? storedLocale
          : (detectedLocale ??
            (isLocale(serverLocale) ? serverLocale : undefined) ??
            localeFromCountry(country) ??
            initialLocale);
    setLocale(resolvedLocale);
    const storedSidebarState = window.localStorage.getItem(
      SIGNED_IN_SIDEBAR_STORAGE_KEY,
    );
    const isMobile =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 900px)").matches;
    setSidebarCollapsed(isMobile ? true : storedSidebarState === "true");
  }, [initialLocale]);

  useEffect(() => {
    if (!signedIn) return;
    const queryLocale = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(queryLocale)) return;
    let active = true;
    const requestRevision = localeSelectionRevision.current;
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
        if (
          active &&
          localeSelectionRevision.current === requestRevision &&
          isLocale(payload.locale)
        ) {
          applyLocale(payload.locale);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [applyLocale, signedIn]);

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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshIfActive();
    };
    window.addEventListener(BILLING_CHANGED_EVENT, handleBillingChanged);
    window.addEventListener("focus", handleBillingChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshIfActive();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(BILLING_CHANGED_EVENT, handleBillingChanged);
      window.removeEventListener("focus", handleBillingChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshBillingStatus, signedIn]);

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
    if (!signedIn) return;
    const url = new URL(window.location.href);
    const billingReturn = url.searchParams.get("billing");
    if (billingReturn !== "plans" && billingReturn !== "success") return;

    setSubscriptionModalOpen(true);
    const refreshTimers =
      billingReturn === "success"
        ? [0, 1_500, 4_000, 8_000].map((delay) =>
            window.setTimeout(() => {
              void refreshBillingStatus();
            }, delay),
          )
        : [];
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
    return () => {
      for (const timer of refreshTimers) window.clearTimeout(timer);
    };
  }, [refreshBillingStatus, signedIn]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${copy[locale].hero.titleLead} ${copy[locale].hero.titleTail} · Stocksembly`;
  }, [locale]);

  return (
    <div
      className={`app-shell${signedIn ? " app-shell--signed-in" : ""}${
        sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""
      }`}
    >
      <SiteAtmosphere />
      {signedIn ? (
        <SignedInSidebar
          locale={locale}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onLocaleChange={(nextLocale) => {
            localeSelectionRevision.current += 1;
            applyLocale(nextLocale);
          }}
          onSignedOut={() => {
            setSidebarCollapsed(false);
            setSignedIn(false);
          }}
          onOpenSubscription={openSubscriptionModal}
          subscriptionTier={subscriptionTier}
        />
      ) : null}
      {signedIn ? null : (
        <Header locale={locale} onLocaleChange={selectLocale} />
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
            initialLocale={initialLocale}
            initialPreview={researchRoomPreview}
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
      <MobileBottomNav
        activeItem="home"
        locale={locale}
        hidden={signedIn && !sidebarCollapsed}
      />
      {subscriptionModalOpen ? (
        <SubscriptionModal
          open
          locale={researchLocale(locale)}
          subscriptionTier={subscriptionTier}
          plans={billingPlans}
          billingStatus={billingStatus}
          loading={billingPlansLoading}
          error={billingPlansError}
          onClose={closeSubscriptionModal}
        />
      ) : null}
    </div>
  );
}

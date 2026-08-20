"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useCallback, useEffect, useState } from "react";

const CONSENT_COOKIE = "stocksembly_analytics_consent";
const PENDING_KEY = "stocksembly:pending-acquisition-v1";

type Props = {
  readonly enabled: boolean;
  readonly measurementId?: string;
};

type Consent = "granted" | "denied" | "unset";
type PendingAttribution = Record<string, string>;

function currentConsent(): Consent {
  const value = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : "unset";
}

function clean(value: string | null): string | undefined {
  const normalized = value?.trim().slice(0, 120);
  return normalized ? normalized : undefined;
}

function pendingAttribution(): PendingAttribution {
  const url = new URL(window.location.href);
  const source = clean(url.searchParams.get("utm_source"));
  const medium = clean(url.searchParams.get("utm_medium"));
  const campaign = clean(url.searchParams.get("utm_campaign"));
  const term = clean(url.searchParams.get("utm_term"));
  const content = clean(url.searchParams.get("utm_content"));
  let referrerHost: string | undefined;
  if (document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== url.origin) referrerHost = referrer.hostname;
    } catch {
      referrerHost = undefined;
    }
  }
  return {
    ...(source === undefined ? {} : { source }),
    ...(medium === undefined ? {} : { medium }),
    ...(campaign === undefined ? {} : { campaign }),
    ...(term === undefined ? {} : { term }),
    ...(content === undefined ? {} : { content }),
    ...(referrerHost === undefined ? {} : { referrerHost }),
    landingPath: url.pathname.slice(0, 500),
    capturedAt: new Date().toISOString(),
  };
}

function hasExplicitCampaign(value: PendingAttribution): boolean {
  return ["source", "medium", "campaign", "term", "content"].some(
    (key) => typeof value[key] === "string" && value[key] !== "",
  );
}

function persistPendingAttribution(): void {
  const current = pendingAttribution();
  const saved = window.localStorage.getItem(PENDING_KEY);
  if (saved === null) {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(current));
    return;
  }
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (parsed === null || typeof parsed !== "object") throw new TypeError();
    const previous = parsed as PendingAttribution;
    // Preserve first-touch campaign attribution, but let the first explicit
    // UTM replace an earlier unattributed/direct landing before signup.
    if (!hasExplicitCampaign(previous) && hasExplicitCampaign(current))
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(current));
  } catch {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(current));
  }
}

async function submitPendingAttribution(): Promise<void> {
  const pending = window.localStorage.getItem(PENDING_KEY);
  if (pending === null) return;
  const response = await fetch("/api/analytics/attribution", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: pending,
  }).catch(() => undefined);
  if (
    response?.ok ||
    (response !== undefined && [400, 413, 415].includes(response.status))
  )
    window.localStorage.removeItem(PENDING_KEY);
}

export function AnalyticsConsent({ enabled, measurementId }: Props) {
  const [consent, setConsent] = useState<Consent>("unset");
  const activate = useCallback(() => {
    if (!enabled) return;
    persistPendingAttribution();
    void submitPendingAttribution();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const next = currentConsent();
    setConsent(next);
    if (next === "granted") activate();
    const onSessionReady = () => void submitPendingAttribution();
    window.addEventListener("stocksembly:auth-session-ready", onSessionReady);
    return () =>
      window.removeEventListener(
        "stocksembly:auth-session-ready",
        onSessionReady,
      );
  }, [activate, enabled]);

  if (!enabled) return null;
  const choose = (next: Exclude<Consent, "unset">) => {
    // biome-ignore lint/suspicious/noDocumentCookie: broad browser support is required for the server-readable consent gate.
    document.cookie = `${CONSENT_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setConsent(next);
    if (next === "granted") activate();
    else window.localStorage.removeItem(PENDING_KEY);
  };
  return (
    <>
      {consent === "granted" && measurementId ? (
        <GoogleAnalytics gaId={measurementId} />
      ) : null}
      {consent === "unset" ? (
        <aside className="analytics-consent" aria-label="분석 쿠키 동의">
          <div>
            <strong>서비스 개선을 위한 분석</strong>
            <p>
              동의하면 유입 경로와 익명화된 사용 흐름을 저장합니다. 필수 로그인
              쿠키에는 영향이 없습니다.
            </p>
          </div>
          <button type="button" onClick={() => choose("denied")}>
            거절
          </button>
          <button
            className="is-primary"
            type="button"
            onClick={() => choose("granted")}
          >
            동의
          </button>
        </aside>
      ) : null}
    </>
  );
}

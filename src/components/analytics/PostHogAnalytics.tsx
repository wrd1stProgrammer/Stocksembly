"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";
import { analyticsConsent } from "../../lib/analytics/client";
import {
  analyticsPath,
  analyticsUrl,
  posthogEnabled,
  posthogHost,
  posthogToken,
} from "../../lib/analytics/config";

let initialized = false;

export function PostHogAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!posthogEnabled || !analyticsConsent()) return;
    if (!initialized) {
      posthog.init(posthogToken, {
        api_host: posthogHost,
        ui_host: "https://us.posthog.com",
        persistence: "localStorage",
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        capture_dead_clicks: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        ip: false,
        disable_surveys: true,
        enable_recording_console_log: false,
        save_referrer: false,
        store_google: false,
        disable_capture_url_hashes: true,
        mask_personal_data_properties: true,
        custom_personal_data_properties: [
          "email",
          "question",
          "prompt",
          "token",
          "code",
          "next",
          "symbol",
        ],
        get_current_url: analyticsUrl,
        session_recording: {
          maskAllInputs: true,
          maskAllElementAttributes: true,
          maskTextSelector: "*",
          blockSelector:
            "iframe, canvas, img, video, svg, [data-private], .ph-no-capture",
          recordHeaders: false,
          recordBody: false,
          recordCrossOriginIframes: false,
          maskCapturedNetworkRequestFn: () => null,
        },
        before_send: (event) => {
          if (
            !event ||
            !analyticsConsent() ||
            /\/(admin)(\/|$)/.test(window.location.pathname)
          )
            return null;
          for (const key of Object.keys(event.properties)) {
            if (
              /url|referrer|pathname/i.test(key) &&
              typeof event.properties[key] === "string"
            ) {
              event.properties[key] = key.includes("pathname")
                ? analyticsPath(event.properties[key])
                : analyticsUrl(event.properties[key]);
            }
          }
          delete event.properties["$set"];
          delete event.properties["$set_once"];
          delete event.properties["$title"];
          return event;
        },
      });
      initialized = true;
      const params = new URLSearchParams(window.location.search);
      const campaign: Record<string, string> = {};
      for (const name of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
      ]) {
        const value = params.get(name);
        if (value && /^[a-zA-Z0-9_. -]{1,120}$/.test(value))
          campaign[name] = value;
      }
      posthog.register(campaign);
    }
    posthog.opt_in_capturing({ captureEventName: false });
    let active = true;
    const identify = async () => {
      try {
        const user = await getCurrentUser();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            `stocksembly-cognito-principal-v1:${user.userId}`,
          ),
        );
        if (active && analyticsConsent())
          posthog.identify(
            Array.from(new Uint8Array(digest), (n) =>
              n.toString(16).padStart(2, "0"),
            ).join(""),
          );
      } catch {
        if (active && posthog.get_property("$user_id")) posthog.reset();
      }
    };
    void identify();
    window.addEventListener("stocksembly:auth-session-ready", identify);
    const unsafeQuery = Array.from(
      new URLSearchParams(window.location.search),
    ).some(
      ([key, value]) =>
        ![
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "lang",
        ].includes(key) || !/^[a-zA-Z0-9_. -]{1,120}$/.test(value),
    );
    const privatePage =
      /\/(admin|login|signup|confirm|account|billing|checkout)([/-]|$)/.test(
        pathname,
      ) || unsafeQuery;
    if (privatePage) posthog.stopSessionRecording();
    else {
      posthog.startSessionRecording();
    }
    if (!/\/(admin)(\/|$)/.test(pathname))
      posthog.capture("$pageview", {
        $current_url: `${window.location.origin}${analyticsPath(pathname)}`,
        $pathname: analyticsPath(pathname),
      });
    let last = performance.now();
    let visibleMs = 0;
    let visible = document.visibilityState === "visible";
    const flush = () => {
      const now = performance.now();
      if (visible) visibleMs += now - last;
      last = now;
      visible = document.visibilityState === "visible";
      if (
        !/\/(admin)(\/|$)/.test(pathname) &&
        visibleMs > 0 &&
        analyticsConsent()
      )
        posthog.capture("page_engagement", {
          page: analyticsPath(pathname),
          visible_ms: Math.round(visibleMs),
        });
      visibleMs = 0;
      if (!analyticsConsent()) {
        posthog.stopSessionRecording();
        posthog.opt_out_capturing();
      }
    };
    const timer = window.setInterval(flush, 30_000);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      active = false;
      flush();
      posthog.stopSessionRecording();
      clearInterval(timer);
      window.removeEventListener("stocksembly:auth-session-ready", identify);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [pathname]);
  return null;
}

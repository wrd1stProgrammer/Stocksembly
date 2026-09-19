"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  type ProductEngagement as Engagement,
  engagementSurface,
} from "../../admin/productEngagement";

export function trackProductMilestone(
  kind: Exclude<Engagement["kind"], "page">,
): void {
  window.dispatchEvent(
    new CustomEvent("stocksembly:product-milestone", { detail: kind }),
  );
}
export function ProductEngagement() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(?:[a-z-]+\/)?admin(?:\/|$)/.test(pathname)) return;
    let sessionId = crypto.randomUUID();
    try {
      const saved = sessionStorage.getItem("stocksembly:engagement-session");
      if (saved && /^[a-f0-9-]{36}$/.test(saved))
        sessionId = saved as typeof sessionId;
      else sessionStorage.setItem("stocksembly:engagement-session", sessionId);
    } catch {
      /* Ephemeral measurement also works when storage is unavailable. */
    }
    const startedAt = new Date().toISOString();
    const eventId = crypto.randomUUID();
    let visibleMs = 0;
    let lastTick = performance.now();
    let visible = document.visibilityState === "visible";
    const send = (kind: Engagement["kind"] = "page") => {
      if (
        !document.cookie
          .split(";")
          .some((v) => v.trim() === "stocksembly_analytics_consent=granted")
      )
        return;
      const now = performance.now();
      if (visible) visibleMs += now - lastTick;
      lastTick = now;
      visible = document.visibilityState === "visible";
      const at = new Date().toISOString();
      const payload: Engagement = {
        eventId: kind === "page" ? eventId : crypto.randomUUID(),
        sessionId,
        surface: engagementSurface(pathname),
        kind,
        startedAt: kind === "page" ? startedAt : at,
        endedAt: at,
        visibleMs:
          kind === "page" ? Math.min(86400000, Math.floor(visibleMs)) : 0,
      };
      void fetch("/api/analytics/engagement", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    };
    const flush = () => send();
    const milestone = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        ["interests_saved", "onboarding_completed", "plans_opened"].includes(
          event.detail,
        )
      )
        send(event.detail);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") send();
    }, 30_000);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("stocksembly:product-milestone", milestone);
    return () => {
      flush();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("stocksembly:product-milestone", milestone);
    };
  }, [pathname]);
  return null;
}

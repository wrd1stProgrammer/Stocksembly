"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  type AggregateVisit,
  aggregateSource,
  allowsAggregate,
  publicSurface,
} from "../../lib/analytics/aggregate";
import { posthogEnabled } from "../../lib/analytics/config";

export function AggregateVisits() {
  const pathname = usePathname();
  const viewedPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    const allowed = () =>
      allowsAggregate(
        document.cookie,
        Reflect.get(navigator, "globalPrivacyControl") === true,
        navigator.doNotTrack,
      );
    const surface = publicSurface(pathname);
    if (!posthogEnabled || !surface || !allowed()) return;
    const source = aggregateSource(window.location.search);
    const device = window.innerWidth < 768 ? "small_screen" : "large_screen";
    let last = performance.now();
    let visible = document.visibilityState === "visible";
    let elapsed = 0;
    let depth: AggregateVisit["scrollDepth"] = 0;
    const send = (kind: AggregateVisit["kind"], visibleSeconds: number) => {
      if (!allowed()) return;
      void fetch("/api/analytics/aggregate", {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          surface,
          source,
          device,
          visibleSeconds,
          scrollDepth: depth,
        }),
      }).catch(() => undefined);
    };
    if (viewedPath.current !== pathname) {
      send("pageview", 0);
      viewedPath.current = pathname;
    }
    const flush = () => {
      const now = performance.now();
      if (visible) elapsed += now - last;
      last = now;
      visible = document.visibilityState === "visible";
      if (elapsed >= 1000) {
        const seconds = Math.min(1800, Math.floor(elapsed / 1000));
        elapsed %= 1000;
        send("engagement", seconds);
      }
    };
    const scroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const reached = Math.min(
        100,
        Math.floor((window.scrollY / max) * 4) * 25,
      );
      if (reached === 25 || reached === 50 || reached === 75 || reached === 100)
        depth = Math.max(depth, reached) as AggregateVisit["scrollDepth"];
    };
    const timer = window.setInterval(flush, 30_000);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      flush();
      clearInterval(timer);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [pathname]);
  return null;
}

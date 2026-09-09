"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import {
  clearResearchSession,
  syncResearchSession,
} from "@/src/auth/researchSession";
import { isLocale } from "@/src/lib/i18n";

export function AuthSessionBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const [, localeSegment, editorialSegment] = pathname.split("/");
    const isEditorialRoute =
      isLocale(localeSegment) &&
      (editorialSegment === "blog" || editorialSegment === "glossary");
    const needsServerSession =
      pathname.startsWith("/research/") ||
      pathname === "/research-room" ||
      pathname.startsWith("/research-room/") ||
      pathname === "/briefing-room" ||
      pathname.startsWith("/briefing-room/") ||
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      isEditorialRoute;
    if (!configureAmplifyAuth()) {
      if (needsServerSession)
        void clearResearchSession()
          .then((changed) => {
            if (active && changed) router.refresh();
          })
          .catch(() => undefined);
      return () => {
        active = false;
      };
    }
    void getCurrentUser().then(
      async () => {
        await syncResearchSession()
          .then((changed) => {
            if (active)
              window.dispatchEvent(
                new CustomEvent("stocksembly:auth-session-ready"),
              );
            if (active && changed && needsServerSession) router.refresh();
          })
          .catch(() => undefined);
      },
      async () => {
        if (!needsServerSession) return;
        const changed = await clearResearchSession().catch(() => false);
        if (active && changed) router.refresh();
      },
    );
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return null;
}

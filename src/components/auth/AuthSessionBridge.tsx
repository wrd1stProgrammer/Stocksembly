"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import { syncResearchSession } from "@/src/auth/researchSession";

export function AuthSessionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!configureAmplifyAuth()) return;
    let active = true;
    void getCurrentUser()
      .then(async () => {
        const changed = await syncResearchSession();
        const needsServerSession =
          pathname.startsWith("/research/") ||
          pathname === "/research-room" ||
          pathname.startsWith("/research-room/");
        if (active && changed && needsServerSession) {
          window.location.reload();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  return null;
}

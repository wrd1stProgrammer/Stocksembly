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
        if (active && changed && pathname.startsWith("/research/")) {
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

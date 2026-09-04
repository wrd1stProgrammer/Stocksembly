"use client";

import "../../styles/auth.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import {
  currentAuthTokens,
  syncResearchSession,
} from "@/src/auth/researchSession";
import { AuthFrame, AuthNotice } from "./AuthFrame";

export function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDestination = searchParams.get("next");
  const destination =
    requestedDestination !== null &&
    requestedDestination.startsWith("/") &&
    !requestedDestination.startsWith("//")
      ? requestedDestination
      : "/";
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!configureAmplifyAuth()) {
      setError("Authentication is not configured yet.");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const finish = async () => {
      while (!cancelled && attempts < 24) {
        attempts += 1;
        try {
          const tokens = await currentAuthTokens();
          if (tokens.accessToken === undefined)
            throw new Error("TOKEN_PENDING");
          // Session sync is best-effort here. The browser has a valid Cognito
          // session at this point, and the home shell can retry account sync
          // without trapping a newly created Google account on this screen.
          await syncResearchSession().catch(() => false);
          router.replace(destination);
          return;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
      }
      if (!cancelled) setError("Google sign-in could not be completed.");
    };
    void finish();
    return () => {
      cancelled = true;
    };
  }, [destination, router]);

  return (
    <AuthFrame
      compact
      title="Completing sign in"
      subtitle="Securely connecting your Stocksembly account"
      footer={<p>This window will continue automatically.</p>}
    >
      <div
        className="auth-callback-indicator"
        aria-label="Signing in"
        role="status"
      >
        <span />
        <span />
        <span />
      </div>
      <AuthNotice>{error}</AuthNotice>
    </AuthFrame>
  );
}

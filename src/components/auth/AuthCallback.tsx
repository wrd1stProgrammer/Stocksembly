"use client";

import { getCurrentUser } from "aws-amplify/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import { syncResearchSession } from "@/src/auth/researchSession";
import { AuthFrame, AuthNotice } from "./AuthFrame";

export function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!configureAmplifyAuth()) {
      setError("Authentication is not configured yet.");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const finish = async () => {
      while (!cancelled && attempts < 20) {
        attempts += 1;
        try {
          await getCurrentUser();
          await syncResearchSession();
          router.replace("/");
          return;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }
      if (!cancelled) setError("Google sign-in could not be completed.");
    };
    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

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

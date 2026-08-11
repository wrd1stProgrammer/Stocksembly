"use client";

import { getCurrentUser, signOut } from "aws-amplify/auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { configureAmplifyAuth } from "../../auth/amplifyClient";
import { clearResearchSession } from "../../auth/researchSession";
import type { Locale } from "../../lib/i18n";
import { RecentResearchDrawer } from "./RecentResearchDrawer";

export function HeaderAuthAction({
  label,
  locale,
}: {
  readonly label: string;
  readonly locale: Locale;
}) {
  const [authState, setAuthState] = useState<
    "checking" | "signed-in" | "signed-out"
  >("checking");

  useEffect(() => {
    if (!configureAmplifyAuth()) {
      setAuthState("signed-out");
      return;
    }
    let active = true;
    void getCurrentUser()
      .then(() => {
        if (active) setAuthState("signed-in");
      })
      .catch(() => {
        if (active) setAuthState("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);

  if (authState === "checking") {
    return (
      <button
        aria-busy="true"
        className="sign-in sign-in--button sign-in--checking"
        disabled
        type="button"
      >
        {label}
      </button>
    );
  }

  if (authState === "signed-out") {
    return (
      <Link className="sign-in" href="/login">
        {label}
      </Link>
    );
  }

  return (
    <>
      <RecentResearchDrawer locale={locale} />
      <button
        className="sign-in sign-in--button"
        onClick={() => {
          void clearResearchSession()
            .catch(() => undefined)
            .finally(() => signOut())
            .finally(() => setAuthState("signed-out"));
        }}
        type="button"
      >
        {locale === "ko" ? "로그아웃" : "Sign out"}
      </button>
    </>
  );
}

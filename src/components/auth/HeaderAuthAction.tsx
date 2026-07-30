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
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!configureAmplifyAuth()) return;
    let active = true;
    void getCurrentUser()
      .then(() => {
        if (active) setSignedIn(true);
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!signedIn) {
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
            .finally(() => setSignedIn(false));
        }}
        type="button"
      >
        {locale === "ko" ? "로그아웃" : "Sign out"}
      </button>
    </>
  );
}

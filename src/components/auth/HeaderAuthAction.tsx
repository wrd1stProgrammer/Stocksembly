"use client";

import { getCurrentUser, signOut } from "aws-amplify/auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import { clearResearchSession } from "@/src/auth/researchSession";

export function HeaderAuthAction({ label }: { readonly label: string }) {
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
      Sign out
    </button>
  );
}

"use client";

import { getCurrentUser, signIn, signInWithRedirect } from "aws-amplify/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  configureAmplifyAuth,
  googleAuthIsConfigured,
} from "@/src/auth/amplifyClient";
import { authErrorMessage } from "@/src/auth/authErrors";
import { syncResearchSession } from "@/src/auth/researchSession";
import {
  AuthDivider,
  AuthField,
  AuthFrame,
  AuthNotice,
  AuthSubmitButton,
  GoogleButton,
} from "./AuthFrame";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDestination = searchParams.get("next");
  const destination =
    requestedDestination?.startsWith("/") === true &&
    !requestedDestination.startsWith("//")
      ? requestedDestination
      : "/";
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!configureAmplifyAuth()) {
      setError(
        "Authentication is temporarily unavailable. Please try again shortly.",
      );
      return;
    }
    let active = true;
    void getCurrentUser()
      .then(async () => {
        await syncResearchSession();
        if (active) window.location.replace(destination);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [destination]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (!configureAmplifyAuth())
        throw new Error("Authentication is not configured yet.");
      try {
        await getCurrentUser();
        await syncResearchSession();
        window.location.replace(destination);
        return;
      } catch {
        // No reusable Cognito session exists, so continue with credentials.
      }
      const result = await signIn({ username: email.trim(), password });
      if (result.isSignedIn) {
        await syncResearchSession();
        window.location.replace(destination);
        return;
      }
      if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
        router.push(`/confirm?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      throw new Error("Additional account verification is required.");
    } catch (caught) {
      try {
        await getCurrentUser();
        await syncResearchSession();
        window.location.replace(destination);
        return;
      } catch {
        setError(authErrorMessage(caught));
      }
    } finally {
      setPending(false);
    }
  }

  async function googleSignIn() {
    setError(undefined);
    try {
      if (!configureAmplifyAuth() || !googleAuthIsConfigured())
        throw new Error("Google sign-in is not configured yet.");
      await signInWithRedirect({ provider: "Google" });
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  return (
    <AuthFrame
      compact
      title="Sign in"
      subtitle="Sign in to access Stocksembly"
      footer={
        <p>
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
      }
    >
      <GoogleButton onClick={googleSignIn} />
      <AuthDivider />
      <form className="auth-form" onSubmit={submit}>
        <AuthField
          autoComplete="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <AuthField
          action={<Link href="/forgot-password">Forgot password?</Link>}
          autoComplete="current-password"
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          required
          type="password"
          value={password}
        />
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmitButton pending={pending}>Sign in</AuthSubmitButton>
      </form>
    </AuthFrame>
  );
}

"use client";

import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import { authErrorMessage } from "@/src/auth/authErrors";
import {
  AuthField,
  AuthFrame,
  AuthNotice,
  AuthSubmitButton,
} from "./AuthFrame";

export function ConfirmSignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (!configureAmplifyAuth())
        throw new Error("Authentication is not configured yet.");
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: code.trim(),
      });
      router.replace(`/login?email=${encodeURIComponent(email.trim())}`);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setError(undefined);
    setMessage(undefined);
    try {
      if (!configureAmplifyAuth())
        throw new Error("Authentication is not configured yet.");
      await resendSignUpCode({ username: email.trim() });
      setMessage("A new verification code was sent.");
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  return (
    <AuthFrame
      compact
      title="Verify your email"
      subtitle="Enter the six-digit code sent to your inbox"
      footer={
        <p>
          Already verified? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form auth-form--standalone" onSubmit={submit}>
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
          autoComplete="one-time-code"
          inputMode="numeric"
          label="Verification code"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/gu, ""))}
          placeholder="000000"
          required
          value={code}
        />
        <AuthNotice tone="success">{message}</AuthNotice>
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmitButton pending={pending}>Verify email</AuthSubmitButton>
        <button className="auth-text-button" onClick={resend} type="button">
          Send a new code
        </button>
      </form>
    </AuthFrame>
  );
}

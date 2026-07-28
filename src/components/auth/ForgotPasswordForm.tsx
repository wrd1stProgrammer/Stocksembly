"use client";

import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { configureAmplifyAuth } from "@/src/auth/amplifyClient";
import { authErrorMessage } from "@/src/auth/authErrors";
import {
  AuthField,
  AuthFrame,
  AuthNotice,
  AuthSubmitButton,
} from "./AuthFrame";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (!configureAmplifyAuth())
        throw new Error("Authentication is not configured yet.");
      if (step === "request") {
        await resetPassword({ username: email.trim() });
        setStep("confirm");
      } else {
        await confirmResetPassword({
          username: email.trim(),
          confirmationCode: code.trim(),
          newPassword: password,
        });
        router.replace(`/login?email=${encodeURIComponent(email.trim())}`);
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      compact
      title={
        step === "request" ? "Reset your password" : "Choose a new password"
      }
      subtitle={
        step === "request"
          ? "We will send a verification code to your email"
          : "Enter the code and your new password"
      }
      footer={
        <p>
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form auth-form--standalone" onSubmit={submit}>
        <AuthField
          autoComplete="email"
          disabled={step === "confirm"}
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        {step === "confirm" ? (
          <>
            <AuthField
              autoComplete="one-time-code"
              inputMode="numeric"
              label="Verification code"
              maxLength={6}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/gu, ""))
              }
              placeholder="000000"
              required
              value={code}
            />
            <AuthField
              autoComplete="new-password"
              label="New password"
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 10 characters"
              required
              type="password"
              value={password}
            />
          </>
        ) : null}
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmitButton pending={pending}>
          {step === "request" ? "Send verification code" : "Reset password"}
        </AuthSubmitButton>
      </form>
    </AuthFrame>
  );
}

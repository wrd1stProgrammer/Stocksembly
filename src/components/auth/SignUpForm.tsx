"use client";

import { signInWithRedirect, signUp } from "aws-amplify/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  configureAmplifyAuth,
  googleAuthIsConfigured,
} from "@/src/auth/amplifyClient";
import { authErrorMessage } from "@/src/auth/authErrors";
import {
  AuthDivider,
  AuthField,
  AuthFrame,
  AuthNotice,
  AuthSubmitButton,
  GoogleButton,
} from "./AuthFrame";

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    if (!accepted) {
      setError("Accept the terms and privacy policy to continue.");
      return;
    }
    setPending(true);
    try {
      if (!configureAmplifyAuth())
        throw new Error("Authentication is not configured yet.");
      const result = await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: { email: email.trim(), name: name.trim() },
        },
      });
      if (result.isSignUpComplete) {
        router.replace(`/login?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      router.push(`/confirm?email=${encodeURIComponent(email.trim())}`);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function googleSignUp() {
    setError(undefined);
    try {
      if (!configureAmplifyAuth() || !googleAuthIsConfigured())
        throw new Error("Google sign-up is not configured yet.");
      await signInWithRedirect({ provider: "Google" });
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  return (
    <AuthFrame
      title="Create an account"
      footer={
        <p>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      <GoogleButton onClick={googleSignUp} />
      <AuthDivider />
      <form className="auth-form" onSubmit={submit}>
        <AuthField
          autoComplete="name"
          label="Name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          required
          type="text"
          value={name}
        />
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
          autoComplete="new-password"
          label="Password"
          minLength={10}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimum 10 characters"
          required
          type="password"
          value={password}
        />
        <AuthField
          autoComplete="new-password"
          label="Confirm password"
          minLength={10}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Repeat your password"
          required
          type="password"
          value={confirmation}
        />
        <label className="auth-consent">
          <input
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            type="checkbox"
          />
          <span>
            I accept the <Link href="/terms">Terms of Service</Link>,{" "}
            <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/risk-disclosure">Risk Disclosure</Link>.
          </span>
        </label>
        <AuthNotice>{error}</AuthNotice>
        <AuthSubmitButton pending={pending}>Create my account</AuthSubmitButton>
      </form>
    </AuthFrame>
  );
}

"use client";

import "../../styles/auth.css";
import {
  Check,
  Eye,
  EyeSlash,
  GoogleLogo,
  SpinnerGap,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import {
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  useState,
} from "react";
import { SiteAtmosphere } from "../SiteAtmosphere";

type AuthFrameProps = {
  readonly children: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly footer: ReactNode;
  readonly compact?: boolean;
};

export function AuthFrame({
  children,
  title,
  subtitle,
  footer,
  compact = false,
}: AuthFrameProps) {
  return (
    <main className="auth-shell">
      <SiteAtmosphere />
      <div className="auth-shell__glow" aria-hidden="true" />
      <Link
        className="auth-shell__brand"
        href="/"
        aria-label="Stocksembly home"
      >
        <Image
          src="/brand/stocksembly-mark-v2.png"
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          priority
        />
        Stocksembly
      </Link>
      <section className={`auth-card${compact ? " auth-card--compact" : ""}`}>
        <header className="auth-card__header">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        {children}
        <footer className="auth-card__footer">{footer}</footer>
      </section>
    </main>
  );
}

export function GoogleButton({
  disabled,
  onClick,
}: {
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="auth-google"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <GoogleLogo aria-hidden="true" size={21} weight="bold" />
      Continue with Google
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="auth-divider" aria-hidden="true">
      <span />
      <small>OR</small>
      <span />
    </div>
  );
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly action?: ReactNode;
};

export function AuthField({
  label,
  action,
  type,
  ...inputProps
}: AuthFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const password = type === "password";
  return (
    <label className="auth-field">
      <span className="auth-field__label">
        <strong>{label}</strong>
        {action}
      </span>
      <span className="auth-field__control">
        <input
          {...inputProps}
          type={password && passwordVisible ? "text" : type}
        />
        {password ? (
          <button
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            onClick={() => setPasswordVisible((visible) => !visible)}
            tabIndex={-1}
            type="button"
          >
            {passwordVisible ? (
              <EyeSlash aria-hidden="true" size={19} />
            ) : (
              <Eye aria-hidden="true" size={19} />
            )}
          </button>
        ) : null}
      </span>
    </label>
  );
}

export function AuthSubmitButton({
  children,
  pending,
}: {
  readonly children: ReactNode;
  readonly pending: boolean;
}) {
  return (
    <button className="auth-submit" disabled={pending} type="submit">
      {pending ? (
        <SpinnerGap aria-hidden="true" className="spin" size={20} />
      ) : null}
      {children}
    </button>
  );
}

export function AuthNotice({
  children,
  tone = "error",
}: {
  readonly children?: ReactNode;
  readonly tone?: "error" | "success";
}) {
  return children ? (
    <p className={`auth-notice auth-notice--${tone}`} role="status">
      {tone === "success" ? <Check aria-hidden="true" size={17} /> : null}
      {children}
    </p>
  ) : null;
}

export type AuthFormHandler = (event: FormEvent<HTMLFormElement>) => void;

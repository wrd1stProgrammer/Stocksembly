import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/src/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

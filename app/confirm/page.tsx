import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmSignUpForm } from "@/src/components/auth/ConfirmSignUpForm";

export const metadata: Metadata = { title: "Verify email" };

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmSignUpForm />
    </Suspense>
  );
}

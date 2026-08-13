import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback } from "@/src/components/auth/AuthCallback";

export const metadata: Metadata = {
  title: "Completing sign in",
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallback />
    </Suspense>
  );
}

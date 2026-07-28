import type { Metadata } from "next";
import { AuthCallback } from "@/src/components/auth/AuthCallback";

export const metadata: Metadata = { title: "Completing sign in" };

export default function AuthCallbackPage() {
  return <AuthCallback />;
}

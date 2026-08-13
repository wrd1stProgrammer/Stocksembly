import type { Metadata } from "next";
import { SignUpForm } from "@/src/components/auth/SignUpForm";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <SignUpForm />;
}

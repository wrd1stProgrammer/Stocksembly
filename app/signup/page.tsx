import type { Metadata } from "next";
import { SignUpForm } from "@/src/components/auth/SignUpForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return <SignUpForm />;
}

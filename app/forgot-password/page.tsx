import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/src/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

import type { Metadata } from "next";
import { LegalDocumentPage } from "@/src/components/legal/LegalDocumentPage";
import { termsDocument } from "@/src/lib/legal/terms";

export const metadata: Metadata = {
  title: termsDocument.title,
  description: termsDocument.description,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDocumentPage document={termsDocument} />;
}

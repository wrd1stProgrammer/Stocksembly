import type { Metadata } from "next";
import { LegalDocumentPage } from "@/src/components/legal/LegalDocumentPage";
import { privacyDocument } from "@/src/lib/legal/privacy";

export const metadata: Metadata = {
  title: privacyDocument.title,
  description: privacyDocument.description,
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={privacyDocument} />;
}

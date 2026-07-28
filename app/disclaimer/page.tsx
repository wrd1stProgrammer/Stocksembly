import type { Metadata } from "next";
import { LegalDocumentPage } from "@/src/components/legal/LegalDocumentPage";
import { disclaimerDocument } from "@/src/lib/legal/disclaimer";

export const metadata: Metadata = {
  title: disclaimerDocument.title,
  description: disclaimerDocument.description,
};

export default function DisclaimerPage() {
  return <LegalDocumentPage document={disclaimerDocument} />;
}

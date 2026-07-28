import type { Metadata } from "next";
import { LegalDocumentPage } from "@/src/components/legal/LegalDocumentPage";
import { riskDisclosureDocument } from "@/src/lib/legal/riskDisclosure";

export const metadata: Metadata = {
  title: riskDisclosureDocument.title,
  description: riskDisclosureDocument.description,
};

export default function RiskDisclosurePage() {
  return <LegalDocumentPage document={riskDisclosureDocument} />;
}

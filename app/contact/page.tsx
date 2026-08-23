import type { Metadata } from "next";
import { PublicInformationPage } from "@/src/components/publicInformation/PublicInformationPage";
import { contactDocument } from "@/src/lib/publicInformation/contact";
import type { PublicInformationRouteProps } from "@/src/lib/publicInformation/contracts";
import {
  publicInformationLocale,
  publicInformationMetadata,
} from "@/src/lib/publicInformation/routes";

export async function generateMetadata({
  searchParams,
}: PublicInformationRouteProps): Promise<Metadata> {
  const query = await searchParams;
  return publicInformationMetadata(
    contactDocument,
    publicInformationLocale(query.lang),
  );
}

export default async function ContactPage({
  searchParams,
}: PublicInformationRouteProps) {
  const query = await searchParams;
  return (
    <PublicInformationPage
      document={contactDocument}
      locale={publicInformationLocale(query.lang)}
    />
  );
}

import type { Metadata } from "next";
import { PublicInformationPage } from "@/src/components/publicInformation/PublicInformationPage";
import type { PublicInformationRouteProps } from "@/src/lib/publicInformation/contracts";
import { correctionsDocument } from "@/src/lib/publicInformation/corrections";
import {
  publicInformationLocale,
  publicInformationMetadata,
} from "@/src/lib/publicInformation/routes";

export async function generateMetadata({
  searchParams,
}: PublicInformationRouteProps): Promise<Metadata> {
  const query = await searchParams;
  return publicInformationMetadata(
    correctionsDocument,
    publicInformationLocale(query.lang),
  );
}

export default async function CorrectionsPage({
  searchParams,
}: PublicInformationRouteProps) {
  const query = await searchParams;
  return (
    <PublicInformationPage
      document={correctionsDocument}
      locale={publicInformationLocale(query.lang)}
    />
  );
}

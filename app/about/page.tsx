import type { Metadata } from "next";
import { PublicInformationPage } from "@/src/components/publicInformation/PublicInformationPage";
import { aboutDocument } from "@/src/lib/publicInformation/about";
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
    aboutDocument,
    publicInformationLocale(query.lang),
  );
}

export default async function AboutPage({
  searchParams,
}: PublicInformationRouteProps) {
  const query = await searchParams;
  return (
    <PublicInformationPage
      document={aboutDocument}
      locale={publicInformationLocale(query.lang)}
    />
  );
}

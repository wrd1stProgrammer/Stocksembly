import type { Metadata } from "next";
import { PublicInformationPage } from "@/src/components/publicInformation/PublicInformationPage";
import type { PublicInformationRouteProps } from "@/src/lib/publicInformation/contracts";
import { methodologyDocument } from "@/src/lib/publicInformation/methodology";
import {
  publicInformationLocale,
  publicInformationMetadata,
} from "@/src/lib/publicInformation/routes";

export async function generateMetadata({
  searchParams,
}: PublicInformationRouteProps): Promise<Metadata> {
  const query = await searchParams;
  return publicInformationMetadata(
    methodologyDocument,
    publicInformationLocale(query.lang),
  );
}

export default async function MethodologyPage({
  searchParams,
}: PublicInformationRouteProps) {
  const query = await searchParams;
  return (
    <PublicInformationPage
      document={methodologyDocument}
      locale={publicInformationLocale(query.lang)}
    />
  );
}

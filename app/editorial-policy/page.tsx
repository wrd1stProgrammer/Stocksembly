import type { Metadata } from "next";
import { PublicInformationPage } from "@/src/components/publicInformation/PublicInformationPage";
import type { PublicInformationRouteProps } from "@/src/lib/publicInformation/contracts";
import { editorialPolicyDocument } from "@/src/lib/publicInformation/editorialPolicy";
import {
  publicInformationLocale,
  publicInformationMetadata,
} from "@/src/lib/publicInformation/routes";

export async function generateMetadata({
  searchParams,
}: PublicInformationRouteProps): Promise<Metadata> {
  const query = await searchParams;
  return publicInformationMetadata(
    editorialPolicyDocument,
    publicInformationLocale(query.lang),
  );
}

export default async function EditorialPolicyPage({
  searchParams,
}: PublicInformationRouteProps) {
  const query = await searchParams;
  return (
    <PublicInformationPage
      document={editorialPolicyDocument}
      locale={publicInformationLocale(query.lang)}
    />
  );
}

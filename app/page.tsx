import type { Metadata } from "next";
import { App } from "@/src/App";
import { editorialWorkspaceAccess } from "@/src/editorial/server/editorialWorkspaceAccess";
import { homeMetadata } from "@/src/lib/seo/homeMetadata";
import {
  homeStructuredData,
  serializeStructuredData,
} from "@/src/lib/seo/homeStructuredData";
import { homeLocale } from "./_lib/homeLocale";
import { loadLandingResearchRoomPreview } from "./_lib/landingResearchRoomPreview";

type Props = {
  readonly searchParams: Promise<{ readonly lang?: string }>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { lang } = await searchParams;
  return homeMetadata(await homeLocale(lang));
}

export default async function HomePage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const locale = await homeLocale(lang);
  const initialAccess = await editorialWorkspaceAccess("/");
  const researchRoomPreview = await loadLandingResearchRoomPreview(
    locale,
    initialAccess,
  );
  return (
    <>
      <App
        initialAccess={initialAccess}
        initialLocale={locale}
        researchRoomPreview={researchRoomPreview}
      />
      <script type="application/ld+json">
        {serializeStructuredData(homeStructuredData(locale))}
      </script>
    </>
  );
}

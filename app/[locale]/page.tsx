import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { App } from "@/src/App";
import { editorialWorkspaceAccess } from "@/src/editorial/server/editorialWorkspaceAccess";
import { isLocale } from "@/src/lib/i18n";
import { homeMetadata } from "@/src/lib/seo/homeMetadata";
import {
  homeStructuredData,
  serializeStructuredData,
} from "@/src/lib/seo/homeStructuredData";
import { loadLandingResearchRoomPreview } from "../_lib/landingResearchRoomPreview";

type Props = Readonly<{ params: Promise<{ readonly locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return homeMetadata(locale);
}

export default async function LocalizedHomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
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

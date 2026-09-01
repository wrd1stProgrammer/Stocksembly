import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { App } from "@/src/App";
import { copy, isLocale, localeDetails, locales } from "@/src/lib/i18n";
import {
  boundedSeoDescription,
  brandedSeoTitle,
} from "@/src/lib/seo/metadataText";
import { loadLandingResearchRoomPreview } from "../_lib/landingResearchRoomPreview";

type Props = Readonly<{ params: Promise<{ readonly locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  const title = brandedSeoTitle(content.hero.eyebrow);
  const description = boundedSeoDescription(
    `${content.hero.descriptionLead} ${content.hero.descriptionTail}`,
  );
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(
          locales.map((value) => [localeDetails[value].hreflang, `/${value}`]),
        ),
        "x-default": "/en",
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      locale: localeDetails[locale].openGraph,
      alternateLocale: locales
        .filter((value) => value !== locale)
        .map((value) => localeDetails[value].openGraph),
      siteName: "Stocksembly",
      type: "website",
    },
  };
}

export default async function LocalizedHomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const researchRoomPreview = await loadLandingResearchRoomPreview(locale);
  return (
    <App initialLocale={locale} researchRoomPreview={researchRoomPreview} />
  );
}

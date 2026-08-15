import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { App } from "@/src/App";
import { copy, isLocale, localeDetails, locales } from "@/src/lib/i18n";

type Props = Readonly<{ params: Promise<{ readonly locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  return {
    title: `${content.hero.eyebrow} | Stocksembly`,
    description: `${content.hero.descriptionLead} ${content.hero.descriptionTail}`,
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
      title: `${content.hero.eyebrow} | Stocksembly`,
      description: `${content.hero.descriptionLead} ${content.hero.descriptionTail}`,
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
  return <App initialLocale={locale} />;
}

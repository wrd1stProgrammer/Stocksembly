import type { Metadata } from "next";
import { localeDetails, locales } from "../i18n";
import type { AppLocale } from "../supportedLocales";
import { homeMetadataCopy } from "./homeMetadataCopy";

export function homeMetadata(locale: AppLocale): Metadata {
  const { title, description } = homeMetadataCopy[locale];
  const canonical = `/${locale}`;
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical,
      languages: {
        en: "/en",
        ...Object.fromEntries(
          locales.map((value) => [localeDetails[value].hreflang, `/${value}`]),
        ),
        "x-default": "/en",
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: localeDetails[locale].openGraph,
      alternateLocale: locales
        .filter((value) => value !== locale)
        .map((value) => localeDetails[value].openGraph),
      siteName: "Stocksembly",
      type: "website",
      images: [
        {
          url: "/brand/stocksembly-app-icon.png",
          width: 1024,
          height: 1024,
          alt: "Stocksembly",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/brand/stocksembly-app-icon.png"],
    },
  };
}

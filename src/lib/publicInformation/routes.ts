import type { Metadata } from "next";
import type { Locale } from "../i18n";
import type { PublicInformationDocument } from "./contracts";

export function publicInformationLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "ko";
}

export function publicInformationHref(
  document: PublicInformationDocument,
  locale: Locale,
): string {
  return locale === "en" ? `${document.path}?lang=en` : document.path;
}

export function publicInformationMetadata(
  document: PublicInformationDocument,
  locale: Locale,
): Metadata {
  const canonical = publicInformationHref(document, locale);
  return {
    title: document.title[locale],
    description: document.description[locale],
    alternates: {
      canonical,
      languages: {
        ko: document.path,
        en: `${document.path}?lang=en`,
        "x-default": document.path,
      },
    },
    openGraph: {
      title: document.title[locale],
      description: document.description[locale],
      url: canonical,
      type: "website",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: locale === "ko" ? "en_US" : "ko_KR",
    },
  };
}

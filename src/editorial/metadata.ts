import type { Metadata } from "next";
import type { AppLocale } from "../lib/i18n";
import { intlLocale, localeDetails, locales } from "../lib/i18n";
import {
  boundedSeoDescription,
  brandedSeoTitle,
} from "../lib/seo/metadataText";
import { editorialLocalePaths, editorialPath } from "./catalog";
import { editorialContent } from "./content";
import type { EditorialDefinition, EditorialKind } from "./types";

const BASE_URL = "https://stocksembly.com";

function languageAlternates(
  kind: EditorialKind,
  slug?: EditorialDefinition["slug"],
) {
  const paths = editorialLocalePaths(kind, slug);
  return {
    ...Object.fromEntries(
      locales.map((locale) => [localeDetails[locale].hreflang, paths[locale]]),
    ),
    "x-default": paths.en,
  };
}

export function editorialIndexMetadata(
  locale: AppLocale,
  kind: EditorialKind,
): Metadata {
  const ui = editorialContent[locale].ui;
  const title = kind === "blog" ? ui.blogTitle : ui.glossaryTitle;
  const description = boundedSeoDescription(
    kind === "blog" ? ui.blogDescription : ui.glossaryDescription,
  );
  const seoTitle = brandedSeoTitle(title);
  const path = editorialPath(locale, kind);
  return {
    title: { absolute: seoTitle },
    description,
    alternates: { canonical: path, languages: languageAlternates(kind) },
    openGraph: {
      title: seoTitle,
      description,
      url: path,
      locale: localeDetails[locale].openGraph,
      alternateLocale: locales
        .filter((value) => value !== locale)
        .map((value) => localeDetails[value].openGraph),
      siteName: "Stocksembly",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: seoTitle, description },
  };
}

export function editorialEntryMetadata(
  locale: AppLocale,
  definition: EditorialDefinition,
): Metadata {
  const copy = editorialContent[locale].entries[definition.slug];
  const path = editorialPath(locale, definition.kind, definition.slug);
  const image = `${BASE_URL}${definition.image}`;
  const title = brandedSeoTitle(copy.title);
  const description = boundedSeoDescription(copy.description);
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: path,
      languages: languageAlternates(definition.kind, definition.slug),
    },
    openGraph: {
      title,
      description,
      url: path,
      locale: localeDetails[locale].openGraph,
      siteName: "Stocksembly",
      type: definition.kind === "blog" ? "article" : "website",
      ...(definition.kind === "blog"
        ? {
            publishedTime: definition.publishedAt,
            modifiedTime: definition.modifiedAt,
          }
        : {}),
      images: [{ url: image, alt: copy.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: { "content-language": intlLocale(locale) },
  };
}

import type { AppLocale } from "../lib/i18n";

export type EditorialKind = "blog" | "glossary";

export const editorialSlugs = [
  "how-to-read-a-10-k",
  "earnings-quality-and-cash-conversion",
  "how-to-choose-comparable-companies",
  "bull-base-bear-scenario-analysis",
  "counterarguments-in-ai-stock-research",
  "free-cash-flow",
  "ev-to-ebitda",
  "earnings-guidance",
  "share-dilution",
  "margin-of-safety",
] as const;

export type EditorialSlug = (typeof editorialSlugs)[number];

export type EditorialDefinition = Readonly<{
  slug: EditorialSlug;
  kind: EditorialKind;
  image: string;
  publishedAt: string;
  modifiedAt: string;
  readingMinutes: number;
  related: readonly EditorialSlug[];
}>;

export type EditorialSection = Readonly<{
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}>;

export type EditorialDepthContent = Readonly<
  Record<EditorialSlug, readonly EditorialSection[]>
>;

export type EditorialEntryCopy = Readonly<{
  title: string;
  description: string;
  category: string;
  imageAlt: string;
  sections: readonly EditorialSection[];
}>;

export type EditorialUiCopy = Readonly<{
  blogEyebrow: string;
  blogTitle: string;
  blogDescription: string;
  glossaryEyebrow: string;
  glossaryTitle: string;
  glossaryDescription: string;
  backToBlog: string;
  backToGlossary: string;
  readArticle: string;
  readDefinition: string;
  readNext: string;
  minutes: string;
  updated: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaAction: string;
  sidebarBlog: string;
  sidebarGlossary: string;
}>;

export type EditorialLocaleContent = Readonly<{
  ui: EditorialUiCopy;
  entries: Readonly<Record<EditorialSlug, EditorialEntryCopy>>;
}>;

export type EditorialRouteParams = Readonly<{
  locale: AppLocale;
  kind: EditorialKind;
  slug?: EditorialSlug;
}>;

import type { AppLocale } from "../lib/i18n";
import { locales } from "../lib/i18n";
import type {
  EditorialDefinition,
  EditorialKind,
  EditorialSlug,
} from "./types";

export const editorialDefinitions = [
  {
    slug: "how-to-read-a-10-k",
    kind: "blog",
    image: "/editorial/blog-reading-10k.webp",
    publishedAt: "2026-08-15T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 10,
    related: [
      "free-cash-flow",
      "earnings-quality-and-cash-conversion",
      "share-dilution",
    ],
  },
  {
    slug: "earnings-quality-and-cash-conversion",
    kind: "blog",
    image: "/editorial/blog-earnings-quality.webp",
    publishedAt: "2026-08-13T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 9,
    related: ["free-cash-flow", "how-to-read-a-10-k", "earnings-guidance"],
  },
  {
    slug: "how-to-choose-comparable-companies",
    kind: "blog",
    image: "/editorial/blog-peer-comparison.webp",
    publishedAt: "2026-08-11T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 9,
    related: [
      "ev-to-ebitda",
      "margin-of-safety",
      "bull-base-bear-scenario-analysis",
    ],
  },
  {
    slug: "bull-base-bear-scenario-analysis",
    kind: "blog",
    image: "/editorial/blog-scenario-analysis.webp",
    publishedAt: "2026-08-09T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 10,
    related: [
      "margin-of-safety",
      "earnings-guidance",
      "counterarguments-in-ai-stock-research",
    ],
  },
  {
    slug: "counterarguments-in-ai-stock-research",
    kind: "blog",
    image: "/editorial/blog-counterarguments.webp",
    publishedAt: "2026-08-07T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 9,
    related: [
      "bull-base-bear-scenario-analysis",
      "margin-of-safety",
      "how-to-choose-comparable-companies",
    ],
  },
  {
    slug: "free-cash-flow",
    kind: "glossary",
    image: "/editorial/glossary-free-cash-flow.webp",
    publishedAt: "2026-08-14T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 6,
    related: [
      "earnings-quality-and-cash-conversion",
      "margin-of-safety",
      "how-to-read-a-10-k",
    ],
  },
  {
    slug: "ev-to-ebitda",
    kind: "glossary",
    image: "/editorial/glossary-ev-ebitda.webp",
    publishedAt: "2026-08-12T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 6,
    related: [
      "how-to-choose-comparable-companies",
      "margin-of-safety",
      "free-cash-flow",
    ],
  },
  {
    slug: "earnings-guidance",
    kind: "glossary",
    image: "/editorial/glossary-earnings-guidance.webp",
    publishedAt: "2026-08-10T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 6,
    related: [
      "bull-base-bear-scenario-analysis",
      "earnings-quality-and-cash-conversion",
      "free-cash-flow",
    ],
  },
  {
    slug: "share-dilution",
    kind: "glossary",
    image: "/editorial/glossary-share-dilution.webp",
    publishedAt: "2026-08-08T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 6,
    related: ["how-to-read-a-10-k", "free-cash-flow", "margin-of-safety"],
  },
  {
    slug: "margin-of-safety",
    kind: "glossary",
    image: "/editorial/glossary-margin-of-safety.webp",
    publishedAt: "2026-08-06T00:00:00.000Z",
    modifiedAt: "2026-08-15T00:00:00.000Z",
    readingMinutes: 6,
    related: [
      "bull-base-bear-scenario-analysis",
      "ev-to-ebitda",
      "counterarguments-in-ai-stock-research",
    ],
  },
] as const satisfies readonly EditorialDefinition[];

const bySlug = new Map(
  editorialDefinitions.map((entry) => [entry.slug, entry] as const),
);

export function editorialDefinition(
  slug: string,
): EditorialDefinition | undefined {
  return bySlug.get(slug as EditorialSlug);
}

export function editorialEntries(kind: EditorialKind) {
  return editorialDefinitions.filter((entry) => entry.kind === kind);
}

export function editorialPath(
  locale: AppLocale,
  kind: EditorialKind,
  slug?: EditorialSlug,
): string {
  return `/${locale}/${kind}${slug === undefined ? "" : `/${slug}`}`;
}

export function editorialLocalePaths(
  kind: EditorialKind,
  slug?: EditorialSlug,
) {
  return Object.fromEntries(
    locales.map((locale) => [locale, editorialPath(locale, kind, slug)]),
  ) as Readonly<Record<AppLocale, string>>;
}

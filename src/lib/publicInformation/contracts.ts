import type { Locale } from "../i18n";

export const PUBLIC_INFORMATION_KEYS = [
  "about",
  "methodology",
  "editorial-policy",
  "corrections",
] as const;

export type PublicInformationKey = (typeof PUBLIC_INFORMATION_KEYS)[number];
export type LocalizedPublicText = Readonly<Record<Locale, string>>;

export type PublicInformationSection = Readonly<{
  id: string;
  title: LocalizedPublicText;
  paragraphs: readonly LocalizedPublicText[];
  bullets?: readonly LocalizedPublicText[];
}>;

export type PublicInformationDocument = Readonly<{
  key: PublicInformationKey;
  path: `/${PublicInformationKey}`;
  schemaType: "AboutPage" | "WebPage";
  title: LocalizedPublicText;
  description: LocalizedPublicText;
  eyebrow: LocalizedPublicText;
  updated: string;
  sections: readonly PublicInformationSection[];
}>;

export type PublicInformationRouteProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

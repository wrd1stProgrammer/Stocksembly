export const RESEARCH_TRANSLATION_LOCALES = [
  "en",
  "ko",
  "ja",
  "zh-TW",
  "es",
  "pt-BR",
  "de",
  "fr",
] as const;

export type ResearchTranslationLocale =
  (typeof RESEARCH_TRANSLATION_LOCALES)[number];

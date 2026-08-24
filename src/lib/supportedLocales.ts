export const locales = [
  "en",
  "ko",
  "ja",
  "zh-TW",
  "es",
  "pt-BR",
  "de",
  "fr",
] as const;

export type AppLocale = (typeof locales)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export function isLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}

import { describe, expect, it } from "vitest";
import {
  localeFromAcceptLanguage,
  localeFromLanguageTag,
  resolveRequestLocale,
} from "./i18n";

describe("locale resolution", () => {
  it("maps the supported regional language tags", () => {
    expect(localeFromLanguageTag("de-DE")).toBe("de");
    expect(localeFromLanguageTag("fr-FR")).toBe("fr");
    expect(localeFromLanguageTag("zh-Hant-HK")).toBe("zh-TW");
    expect(localeFromLanguageTag("pt-PT")).toBe("pt-BR");
  });

  it("honors Accept-Language priorities", () => {
    expect(localeFromAcceptLanguage("fr-FR;q=0.8,de-DE;q=0.9,en;q=0.7")).toBe(
      "de",
    );
  });

  it("prefers a saved locale and falls back to English", () => {
    expect(
      resolveRequestLocale({
        storedLocale: "ja",
        acceptLanguage: "de-DE",
        country: "FR",
      }),
    ).toBe("ja");
    expect(
      resolveRequestLocale({ acceptLanguage: "th-TH", country: "TH" }),
    ).toBe("en");
  });
});

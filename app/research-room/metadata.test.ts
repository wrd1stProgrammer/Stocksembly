import { describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/src/components/researchRoom/ResearchRoomCatalog", () => ({
  ResearchRoomCatalog: () => null,
}));
vi.mock("@/src/research/server/api/liveResearchApi", () => ({}));
vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  RESEARCH_ROOM_PAGE_SIZE: 32,
}));

const languages = {
  "en-US": "/research-room?lang=en",
  "ko-KR": "/research-room?lang=ko",
  "ja-JP": "/research-room?lang=ja",
  "zh-TW": "/research-room?lang=zh-TW",
  es: "/research-room?lang=es",
  "pt-BR": "/research-room?lang=pt-BR",
  "de-DE": "/research-room?lang=de",
  "fr-FR": "/research-room?lang=fr",
  "x-default": "/research-room?lang=en",
};

describe("research room archive metadata", () => {
  it.each([
    [undefined, "en", "US Stock AI Research Room"],
    ["en", "en", "US Stock AI Research Room"],
    ["ko", "ko", "미국 주식 AI 리서치룸"],
  ])(
    "uses the existing locale canonical for lang=%s",
    async (lang, locale, title) => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve(lang === undefined ? {} : { lang }),
      });
      expect(metadata.title).toBe(title);
      expect(metadata.alternates).toEqual({
        canonical: `/research-room?lang=${locale}`,
        languages,
      });
      expect(metadata.openGraph).toMatchObject({
        url: `/research-room?lang=${locale}`,
        locale: locale === "ko" ? "ko_KR" : "en_US",
        alternateLocale: locale === "ko" ? "en_US" : "ko_KR",
      });
    },
  );

  it.each(["en", "ko", "ja", "zh-TW", "es", "pt-BR", "de", "fr"])(
    "preserves page two and language alternates for %s",
    async (lang) => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ lang, page: "2" }),
      });
      expect(metadata.title).toMatch(
        lang === "ko" ? / - 2페이지$/ : / - Page 2$/,
      );
      expect(metadata.alternates).toEqual({
        canonical: `/research-room?lang=${lang}&page=2`,
        languages: Object.fromEntries(
          Object.entries(languages).map(([key, url]) => [key, `${url}&page=2`]),
        ),
      });
      expect(metadata.openGraph).toMatchObject({
        url: `/research-room?lang=${lang}&page=2`,
      });
    },
  );
});

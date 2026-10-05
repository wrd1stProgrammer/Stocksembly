import { describe, expect, it } from "vitest";
import { localeDetails, locales } from "../i18n";
import { homeMetadata } from "./homeMetadata";
import { homeMetadataCopy } from "./homeMetadataCopy";
import { homeStructuredData } from "./homeStructuredData";

describe("localized home SEO metadata", () => {
  it("preserves the approved Korean copy exactly", () => {
    expect(homeMetadataCopy.ko).toEqual({
      title: "미국주식 분석 · 리서치 · 종목 분석 | Stocksembly",
      description:
        "미국주식 분석과 관심 종목 브리핑을 제공. AI 분석팀이 기업·시장·재무·리스크를 여러 관점에서 검토하고, 근거와 출처가 담긴 리서치에 후속 질문을 이어갈 수 있습니다.",
    });
  });

  it.each(locales)(
    "uses complete %s copy across search, social, and schema",
    (locale) => {
      const { title, description } = homeMetadataCopy[locale];
      const metadata = homeMetadata(locale);
      expect(metadata).toMatchObject({
        title: { absolute: title },
        description,
        openGraph: {
          title,
          description,
          url: `/${locale}`,
          locale: localeDetails[locale].openGraph,
          siteName: "Stocksembly",
          type: "website",
          images: [{ url: "/brand/stocksembly-app-icon.png" }],
        },
        twitter: {
          title,
          description,
          card: "summary_large_image",
          images: ["/brand/stocksembly-app-icon.png"],
        },
      });
      expect(title.split("Stocksembly")).toHaveLength(2);
      expect(description).not.toContain("…");
      if (locale !== "en") {
        expect(title).not.toBe(homeMetadataCopy.en.title);
        expect(description).not.toBe(homeMetadataCopy.en.description);
      }
      for (const entity of homeStructuredData(locale)["@graph"]) {
        expect(entity.description).toBe(description);
      }
    },
  );

  it.each(locales)(
    "preserves self-canonical and reciprocal language links for %s",
    (locale) => {
      const metadata = homeMetadata(locale);
      expect(metadata.alternates?.canonical).toBe(`/${locale}`);
      expect(metadata.alternates?.languages).toEqual(
        homeMetadata("en").alternates?.languages,
      );
      for (const alternate of locales) {
        expect(metadata.alternates?.languages).toHaveProperty(
          localeDetails[alternate].hreflang,
          `/${alternate}`,
        );
      }
      expect(metadata.alternates?.languages).toHaveProperty("x-default", "/en");
    },
  );
});

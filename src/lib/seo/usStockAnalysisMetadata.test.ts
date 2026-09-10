import { describe, expect, it } from "vitest";
import { locales } from "../i18n";
import { boundedSeoDescription } from "./metadataText";
import { usStockAnalysisCopy } from "./usStockAnalysis";
import { usStockAnalysisMetadata } from "./usStockAnalysisMetadata";

describe("US stock analysis metadata", () => {
  it("publishes reciprocal Spanish and global English alternates for every locale", () => {
    for (const locale of locales) {
      const languages = usStockAnalysisMetadata(locale).alternates?.languages;
      expect(languages).toMatchObject({
        es: "/es/us-stock-analysis",
        en: "/en/us-stock-analysis",
      });
      expect(languages).not.toHaveProperty("es-419");
      expect(languages).toEqual(
        usStockAnalysisMetadata("en").alternates?.languages,
      );
    }
  });
  it("uses a self-canonical Korean URL with reciprocal language alternates", () => {
    const metadata = usStockAnalysisMetadata("ko");

    expect(metadata).toMatchObject({
      title: { absolute: usStockAnalysisCopy.ko.metadata.title },
      description: usStockAnalysisCopy.ko.metadata.description,
      alternates: {
        canonical: "/ko/us-stock-analysis",
        languages: {
          "ko-KR": "/ko/us-stock-analysis",
          "en-US": "/en/us-stock-analysis",
          "x-default": "/en/us-stock-analysis",
        },
      },
      openGraph: {
        locale: "ko_KR",
        alternateLocale: "en_US",
      },
    });
  });

  it("uses a self-canonical English URL", () => {
    const metadata = usStockAnalysisMetadata("en");

    expect(metadata).toMatchObject({
      title: { absolute: usStockAnalysisCopy.en.metadata.title },
      description: boundedSeoDescription(
        usStockAnalysisCopy.en.metadata.description,
      ),
      alternates: { canonical: "/en/us-stock-analysis" },
      openGraph: {
        locale: "en_US",
        alternateLocale: "ko_KR",
      },
    });
  });

  it("bounds every localized title and description", () => {
    for (const locale of locales) {
      const metadata = usStockAnalysisMetadata(locale);
      const { title } = metadata;
      if (typeof title !== "object" || title === null || !("absolute" in title))
        throw new Error("Expected an absolute stock-analysis title");
      expect(title.absolute.length).toBeLessThanOrEqual(60);
      expect(metadata.description?.length).toBeLessThanOrEqual(160);
    }
  });
});

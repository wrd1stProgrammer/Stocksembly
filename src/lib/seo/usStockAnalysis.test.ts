import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, locales } from "../supportedLocales";
import { boundedSeoDescription, boundedSeoTitle } from "./metadataText";
import {
  US_STOCK_ANALYSIS_PATHS,
  usStockAnalysisContent,
  usStockAnalysisCopy,
} from "./usStockAnalysis";
import { usStockAnalysisMetadata } from "./usStockAnalysisMetadata";

const translatedHeadings = [
  ["ja", "リサーチ委員会による米国株分析", "どの銘柄を分析できますか？"],
  ["zh-TW", "由研究委員會協作完成的美股分析", "可以分析哪些股票？"],
  [
    "es",
    "Análisis de acciones de EE. UU. con un comité de investigación",
    "¿Qué acciones puedo analizar?",
  ],
  [
    "pt-BR",
    "Análise de ações dos EUA feita por um comitê de pesquisa",
    "Quais ações posso analisar?",
  ],
  [
    "de",
    "US-Aktienanalyse durch ein Recherchekomitee",
    "Welche Aktien kann ich analysieren?",
  ],
  [
    "fr",
    "Une analyse des actions américaines menée par un comité de recherche",
    "Quelles actions puis-je analyser ?",
  ],
] as const;

const stringEntries = (value: unknown, path = ""): [string, string][] => {
  if (typeof value === "string") return [[path, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    stringEntries(child, path ? `${path}.${key}` : key),
  );
};

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Digests of the complete, unchanged English and Korean copy before localization.
const originalDigests = {
  en: "409b51b36bc94f60aeff5968584e212cf6ecd4b3e7af9db237af4da3728d2c81",
  ko: "b7f17a597a27095a1fb5a153285295f41c795c92afe95c021c0f6f7cc4054689",
} as const;

describe("localized US stock analysis content", () => {
  it("keeps all eight locales, their paths, and English as the default", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(locales).toEqual([
      "en",
      "ko",
      "ja",
      "zh-TW",
      "es",
      "pt-BR",
      "de",
      "fr",
    ]);
    expect(Object.keys(usStockAnalysisCopy).sort()).toEqual(
      [...locales].sort(),
    );
    for (const locale of locales) {
      expect(US_STOCK_ANALYSIS_PATHS[locale]).toBe(
        `/${locale}/us-stock-analysis`,
      );
    }
  });

  it.each(["en", "ko"] as const)("preserves the complete %s copy", (locale) => {
    expect(digest(usStockAnalysisContent(locale))).toBe(
      originalDigests[locale],
    );
  });

  it.each(translatedHeadings)(
    "returns native headings and FAQ for %s",
    (locale, heading, question) => {
      const copy = usStockAnalysisContent(locale);
      expect(copy.hero.title).toBe(heading);
      expect(copy.questions.items[0]?.title).toBe(question);
      expect(copy).toBe(usStockAnalysisCopy[locale]);
    },
  );

  it.each(translatedHeadings)(
    "fully translates the same content contract for %s",
    (locale) => {
      const english = new Map(stringEntries(usStockAnalysisCopy.en));
      const copy = usStockAnalysisContent(locale);
      const translated = stringEntries(copy);
      expect(translated.map(([key]) => key)).toEqual([...english.keys()]);
      for (const [key, value] of translated) {
        expect(value.trim(), key).not.toBe("");
        if (key.endsWith(".number")) {
          expect(value, key).toBe(english.get(key));
        } else {
          expect(value, key).not.toBe(english.get(key));
        }
        expect(value, key).not.toContain("—");
      }
      expect(copy.committee.eyebrow).toContain("11");
      expect(copy.committee.eyebrow).toContain("4");
      expect(copy.committee.teams).toHaveLength(4);
      expect(copy.process.steps.map(({ number }) => number)).toEqual([
        "01",
        "02",
        "03",
        "04",
      ]);
      expect(copy.hero.description).toContain("Stocksembly");
      expect(copy.hero.proof[0]).toContain("SEC");
      expect(copy.hero.proof[2]).toContain("30");
      expect(copy.standards.points[3]).toContain("30");
      expect(copy.questions.items[1]?.description).toContain("30");
      expect(usStockAnalysisMetadata(locale)).toMatchObject({
        title: { absolute: boundedSeoTitle(copy.metadata.title) },
        description: boundedSeoDescription(copy.metadata.description),
      });
    },
  );
});

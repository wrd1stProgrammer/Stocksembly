import type { Locale } from "../lib/i18n";
import type { ResearchReport } from "./domain/report";

const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/u;
const PERIOD_MARKER = "\u2063";

function sentenceParts(value: string): string[] {
  return value
    .replace(/\b(U\.S|U\.K|e\.g|i\.e)\./giu, (match) =>
      match.replaceAll(".", PERIOD_MARKER),
    )
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.replaceAll(PERIOD_MARKER, "."));
}

function normalized(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function compactNarrative(
  value: string,
  options: { readonly sentences?: number; readonly characters?: number } = {},
): string {
  const sentenceLimit = options.sentences ?? 2;
  const characterLimit = options.characters ?? 360;
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const part of sentenceParts(value)) {
    const sentence = part.trim();
    const signature = normalized(sentence);
    if (sentence.length === 0 || signature.length === 0 || seen.has(signature))
      continue;
    const projectedLength =
      selected.join(" ").length +
      (selected.length === 0 ? 0 : 1) +
      sentence.length;
    if (selected.length > 0 && projectedLength > characterLimit) break;
    seen.add(signature);
    selected.push(sentence);
    if (selected.length >= sentenceLimit) break;
  }
  return selected.join(" ").trim();
}

export function narrativeLayers(value: string): {
  readonly summary: string;
  readonly detail: string;
} {
  const sentences = sentenceParts(value)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return Object.freeze({
    summary: compactNarrative(sentences[0] ?? value, {
      sentences: 1,
      characters: 260,
    }),
    detail: compactNarrative(sentences.slice(1).join(" "), {
      sentences: 3,
      characters: 620,
    }),
  });
}

export function activityCopy(
  value: string,
  locale: Locale,
): { readonly headline: string; readonly body: string } {
  void locale;
  const sentences = sentenceParts(value)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2);
  const [headline = value.trim(), ...rest] = sentences;
  return {
    headline,
    body: rest.join(" ").trim(),
  };
}

function boundedWords(value: string, limit: number): readonly string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/u).filter(Boolean)) {
    if (word.length > limit) {
      if (current !== "") chunks.push(current);
      for (let index = 0; index < word.length; index += limit)
        chunks.push(word.slice(index, index + limit));
      current = "";
      continue;
    }
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = word;
  }
  if (current !== "") chunks.push(current);
  return Object.freeze(chunks);
}

export function speechBubbleSegments(
  value: string,
  locale: Locale,
): readonly string[] {
  void locale;
  const segments = sentenceParts(value).flatMap((sentence) =>
    boundedWords(sentence.trim(), 58),
  );
  return Object.freeze(
    segments.filter(Boolean).slice(0, 4).length > 0
      ? segments.filter(Boolean).slice(0, 4)
      : [value.trim().slice(0, 58)],
  );
}

export type QualitativePosture = "positive" | "neutral" | "caution";

export function qualitativePosture(report: ResearchReport): QualitativePosture {
  const contradictedMaterial = report.claims.some(
    (claim) =>
      claim.materiality === "material" &&
      (claim.semanticVerdict === "contradicted" ||
        claim.semanticVerdict === "not_assessable"),
  );
  if (
    contradictedMaterial ||
    report.locales.en.unknowns.length >= 3 ||
    report.locales.en.dissent.length >= 3
  )
    return "caution";
  const material = report.claims.filter(
    (claim) => claim.materiality === "material",
  );
  if (
    material.length > 0 &&
    material.every((claim) => claim.semanticVerdict === "entailed") &&
    report.locales.en.dissent.length === 0
  )
    return "positive";
  return "neutral";
}

export function postureLabel(
  posture: QualitativePosture,
  locale: Locale,
): string {
  const labels = {
    positive: { en: "Positive", ko: "긍정" },
    neutral: { en: "Neutral", ko: "중립" },
    caution: { en: "Caution", ko: "주의" },
  } as const;
  return labels[posture][locale];
}

export function evidenceScore(report: ResearchReport): {
  readonly passed: number;
  readonly denominator: number;
} {
  return report.metrics.reduce(
    (total, metric) => ({
      passed: total.passed + metric.passed,
      denominator: total.denominator + metric.denominator,
    }),
    { passed: 0, denominator: 0 },
  );
}

export function readerSourceLabel(source: {
  readonly publisher: string;
  readonly title: string;
  readonly sourceClass: string;
  readonly dataset?: string | undefined;
  readonly excerpt?: string | undefined;
}): { readonly publisher: string; readonly title: string } {
  const team = source.publisher.toLocaleLowerCase();
  const teamName =
    team === "market"
      ? "Market team"
      : team === "company"
        ? "Company team"
        : team === "financial"
          ? "Financial team"
          : team === "risk"
            ? "Risk team"
            : source.publisher;
  if (source.sourceClass === "department_consolidation")
    return { publisher: "SERN", title: `${teamName} synthesis` };
  if (source.sourceClass === "owner_response_ballot")
    return { publisher: "SERN", title: `${teamName} response ballot` };
  if (source.sourceClass === "structural_audit")
    return { publisher: "SERN", title: "Structural evidence audit" };
  if (source.sourceClass === "sec_primary_filing") {
    const form = source.excerpt?.match(/"form":"([^"]+)"/u)?.[1];
    const accession = source.title.split(":").at(-1);
    return {
      publisher: "U.S. SEC EDGAR",
      title: [form ?? "Company filing", accession].filter(Boolean).join(" · "),
    };
  }
  if (source.sourceClass === "sec_company_facts")
    return { publisher: "U.S. SEC XBRL", title: "Company facts dataset" };
  if (source.sourceClass === "treasury_yield")
    return {
      publisher: "U.S. Treasury",
      title: "Official Treasury yield curve",
    };
  if (source.sourceClass === "insightsentry_rapidapi") {
    const providerCode =
      source.excerpt?.match(/"providerCode":"([^"]+)"/u)?.[1] ??
      source.excerpt?.match(/"symbol":"([^"]+)"/u)?.[1];
    const [exchange = "Exchange", symbol = "company"] =
      providerCode?.split(":") ?? [];
    if (source.dataset === "market_bars")
      return {
        publisher: `${exchange} market data`,
        title: `${symbol} price bars · derived 1h/4h indicators`,
      };
    if (source.dataset === "insightsentry_quote")
      return {
        publisher: `${exchange} market data`,
        title: `${symbol} official-session quote`,
      };
    if (source.dataset === "insightsentry_documents") {
      const documentTitle =
        source.excerpt?.match(/"title":"([^"]+)"/u)?.[1] ?? "Company filings";
      return {
        publisher: `${symbol} public filings`,
        title: `${documentTitle} · quarterly document collection`,
      };
    }
    if (
      source.dataset === "insightsentry_news_company" ||
      source.dataset === "insightsentry_news_market"
    ) {
      const publishers = [
        ...new Set(
          [...(source.excerpt?.matchAll(/"source":"([^"]+)"/gu) ?? [])].map(
            (match) => match[1],
          ),
        ),
      ].filter((publisher) => publisher !== undefined);
      return {
        publisher:
          publishers.slice(0, 3).join(" · ") || "Public news publishers",
        title:
          source.dataset === "insightsentry_news_company"
            ? `${symbol} company-news collection`
            : `${symbol} market-news collection`,
      };
    }
    return {
      publisher: `${exchange} market data`,
      title: `${symbol} licensed dataset`,
    };
  }
  return { publisher: source.publisher, title: source.title };
}

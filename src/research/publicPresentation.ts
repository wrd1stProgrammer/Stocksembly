import type { Locale } from "../lib/i18n";

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatPercent(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return `${percentFormatter.format(normalized)}%`;
}

export function formatSignedPercent(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${formatPercent(normalized)}`;
}

const DECISION_DIMENSION_LABELS = {
  regime: { en: "Market regime", ko: "시장 국면" },
  timing: { en: "Entry timing", ko: "진입 시점" },
  relative_performance: { en: "Relative performance", ko: "상대 성과" },
  catalyst: { en: "Catalyst", ko: "촉매" },
  growth_engine: { en: "Growth engine", ko: "성장 엔진" },
  adoption: { en: "Adoption", ko: "제품 채택" },
  moat: { en: "Competitive moat", ko: "경쟁우위" },
  competitive_erosion: { en: "Moat erosion", ko: "경쟁우위 훼손" },
  margin: { en: "Margin durability", ko: "마진 지속성" },
  cash_conversion: { en: "Cash conversion", ko: "현금 전환" },
  reinvestment: { en: "Reinvestment", ko: "재투자" },
  embedded_expectations: {
    en: "Priced-in expectations",
    ko: "주가 내재 기대",
  },
  downside_path: { en: "Downside path", ko: "하방 경로" },
  leading_indicator: { en: "Early warning", ko: "조기 경보" },
  mitigant: { en: "Risk buffer", ko: "완충 요인" },
} as const;

export function publicDecisionDimensionLabel(
  dimension: string,
  locale: Locale,
): string {
  return (
    DECISION_DIMENSION_LABELS[
      dimension as keyof typeof DECISION_DIMENSION_LABELS
    ]?.[locale] ?? dimension.replaceAll("_", " ")
  );
}

export function publicEvidenceLabel(
  publisher: string,
  title: string,
  locale: Locale,
): { readonly publisher: string; readonly title: string } {
  if (/insightsentry|rapidapi/iu.test(`${publisher} ${title}`)) {
    const labels = {
      quote: { en: "Current market snapshot", ko: "현재 시장 스냅샷" },
      peers: { en: "Peer comparison set", ko: "동종기업 비교 자료" },
      fundamentals: { en: "Company fundamentals", ko: "기업 펀더멘털 자료" },
      documents: { en: "Company document index", ko: "기업 문서 목록" },
      "request-ledger": { en: "Evidence request record", ko: "근거 요청 기록" },
    } as const;
    const key = Object.keys(labels).find((candidate) =>
      title.toLowerCase().includes(candidate),
    ) as keyof typeof labels | undefined;
    return {
      publisher:
        locale === "ko" ? "Stocksembly 시장 데이터" : "Stocksembly market data",
      title:
        key === undefined
          ? locale === "ko"
            ? "시장 근거 자료"
            : "Market evidence dataset"
          : labels[key][locale],
    };
  }
  return { publisher, title };
}

export function publicMetricSource(source: string, locale: Locale): string {
  return /insightsentry|rapidapi/iu.test(source)
    ? locale === "ko"
      ? "Stocksembly 시장 데이터"
      : "Stocksembly market data"
    : source;
}

const internalRoleIds = new Set([
  "market",
  "market_news",
  "benchmark",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
  "chair",
]);

export function publicPdfEvidenceSource(
  source: {
    readonly publisher: string;
    readonly title: string;
    readonly sourceClass: string;
    readonly url?: string;
  },
  locale: Locale,
): {
  readonly publisher: string;
  readonly title: string;
  readonly url?: string;
} {
  const privateProvider =
    /insightsentry|rapidapi|\bprovider\b|licens|라이선스|데이터 (?:공급자|벤더)|제공 ?업체/iu.test(
      `${source.publisher} ${source.title} ${source.sourceClass} ${source.url ?? ""}`,
    );
  if (privateProvider) {
    const label = publicEvidenceLabel(source.publisher, source.title, locale);
    return {
      publisher:
        locale === "ko" ? "Stocksembly 시장 데이터" : "Stocksembly market data",
      title:
        label.publisher === source.publisher
          ? locale === "ko"
            ? "시장 근거 자료"
            : "Market evidence dataset"
          : label.title,
    };
  }

  const internalArtifact =
    internalRoleIds.has(source.publisher) ||
    /^(?:memo|challenge|response|ballot|consolidation):/iu.test(source.title) ||
    /agent_artifact|accepted_artifact/iu.test(source.sourceClass);
  if (internalArtifact) {
    return {
      publisher: locale === "ko" ? "팀 리서치" : "Team research",
      title: /challenge|response|ballot/iu.test(source.title)
        ? locale === "ko"
          ? "검토 기록"
          : "Review record"
        : locale === "ko"
          ? "분석 기록"
          : "Analysis record",
    };
  }

  const label = publicEvidenceLabel(source.publisher, source.title, locale);
  return {
    ...label,
    ...(source.url === undefined ? {} : { url: source.url }),
  };
}

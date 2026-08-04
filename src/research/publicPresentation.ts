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
      publisher: locale === "ko" ? "시장 근거" : "Market evidence",
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
      ? "시장 근거"
      : "Market evidence"
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
      publisher: locale === "ko" ? "시장 근거" : "Market evidence",
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

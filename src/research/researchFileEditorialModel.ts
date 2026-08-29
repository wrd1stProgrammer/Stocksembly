import type { Locale } from "../lib/i18n";
import type {
  LocalizedText,
  ResearchEvidenceStrength,
  ResearchFileData,
} from "./compositions/types";
import type { ComparatorQualificationResult } from "./domain/comparatorQualificationContracts";
import { workflowRoleById } from "./domain/roleRegistry";
import {
  publicDecisionDimensionLabel,
  publicEvidenceLabel,
} from "./publicPresentation";
import {
  buildEditorialInsights,
  type EditorialDebate,
  type EditorialSnapshotRow,
} from "./researchFileEditorialInsights";

type EditorialLensRow = {
  readonly label: string;
  readonly content: string;
};

type EditorialAnalysisRow = {
  readonly id: string;
  readonly title: string;
  readonly agentView: string;
  readonly evidence: string;
  readonly counterpoint: string;
  readonly checkpoint: string;
  readonly evidenceId?: string;
  readonly strength: ResearchEvidenceStrength;
};

type EditorialComparisonRow = {
  readonly label: string;
  readonly companyView: string;
  readonly benchmarkLens: string;
  readonly interpretation: string;
  readonly evidenceId?: string;
};

const editorialStandardFormatters = {
  en: new Intl.NumberFormat("en-US", {
    notation: "standard",
    maximumFractionDigits: 1,
  }),
  ko: new Intl.NumberFormat("ko-KR", {
    notation: "standard",
    maximumFractionDigits: 1,
  }),
} as const;
function compactDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/u, "");
}

function compactUsd(value: number, locale: Locale): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (locale === "ko") {
    if (absolute >= 1_000_000_000_000)
      return `${sign}US$${compactDecimal(absolute / 1_000_000_000_000)}조`;
    if (absolute >= 100_000_000)
      return `${sign}US$${compactDecimal(absolute / 100_000_000)}억`;
    if (absolute >= 10_000)
      return `${sign}US$${compactDecimal(absolute / 10_000)}만`;
    return `${sign}US$${compactDecimal(absolute)}`;
  }
  if (absolute >= 1_000_000_000_000)
    return `${sign}$${compactDecimal(absolute / 1_000_000_000_000)}T`;
  if (absolute >= 1_000_000_000)
    return `${sign}$${compactDecimal(absolute / 1_000_000_000)}B`;
  if (absolute >= 1_000_000)
    return `${sign}$${compactDecimal(absolute / 1_000_000)}M`;
  if (absolute >= 1_000) return `${sign}$${compactDecimal(absolute / 1_000)}K`;
  return `${sign}$${compactDecimal(absolute)}`;
}

type EditorialTeamRow = {
  readonly departmentId: ResearchFileData["teamViews"][number]["departmentId"];
  readonly teamName: string;
  readonly vote: ResearchFileData["teamViews"][number]["vote"];
  readonly strongestClaim: string;
  readonly evidence: string;
  readonly portraitPath: string;
};

type EditorialSource = ResearchFileData["evidenceIndex"][number];

export type EditorialSourceGroup = {
  readonly number: "01" | "02" | "03" | "04";
  readonly title: string;
  readonly purpose: string;
  readonly sources: readonly EditorialSource[];
};

export type EditorialCallout = {
  readonly headline: string;
  readonly body: string;
};

export type EditorialVisualMetric = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly category:
    | "market"
    | "company"
    | "financial"
    | "risk"
    | "expectations";
  readonly signal: "higher_better" | "lower_better" | "contextual";
  readonly barPercent?: number;
};

export type EditorialEvidenceBalance = {
  readonly total: number;
  readonly supported: number;
  readonly partial: number;
  readonly challenged: number;
  readonly unverified: number;
  readonly segments: readonly {
    readonly id: "supported" | "partial" | "challenged" | "unverified";
    readonly label: string;
    readonly count: number;
    readonly percent: number;
  }[];
};

export type EditorialDecisionPath = {
  readonly id: "confirm" | "hold" | "challenge" | "invalidate";
  readonly label: string;
  readonly headline: string;
  readonly detail: string;
};

export type ResearchFileEditorialModel = {
  readonly structuredDecision?: NonNullable<
    ResearchFileData["structuredEditorial"]
  >["decision"];
  readonly structuredClaims?: NonNullable<
    ResearchFileData["structuredEditorial"]
  >["claims"];
  readonly qualifiedComparators?: NonNullable<
    ResearchFileData["structuredEditorial"]
  >["comparators"];
  readonly question: string;
  readonly directAnswer: string;
  readonly investmentView: readonly string[];
  readonly posture: string;
  readonly conclusionIndex: number;
  readonly conclusionLabel: string;
  readonly evidenceReliability: number;
  readonly headlineMetrics: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly lensRows: readonly EditorialLensRow[];
  readonly companySnapshot: readonly EditorialSnapshotRow[];
  readonly catalysts: readonly EditorialCallout[];
  readonly risks: readonly EditorialCallout[];
  readonly coverage: ResearchFileData["coverage"];
  readonly analysisRows: readonly EditorialAnalysisRow[];
  readonly valuationConclusion: string;
  readonly nextVerificationEvent: string;
  readonly comparisonRows: readonly EditorialComparisonRow[];
  readonly comparatorQualification?: ComparatorQualificationResult;
  readonly scenarios: readonly {
    readonly id: string;
    readonly label: string;
    readonly thesis: string;
    readonly assumptions: readonly string[];
  }[];
  readonly teamRows: readonly EditorialTeamRow[];
  readonly debates: readonly EditorialDebate[];
  readonly initialView: string;
  readonly finalView: string;
  readonly acceptedClaims: readonly string[];
  readonly preservedDissent: readonly string[];
  readonly evidenceIndex: ResearchFileData["evidenceIndex"];
  readonly sourceGroups: readonly EditorialSourceGroup[];
  readonly visualMetrics: readonly EditorialVisualMetric[];
  readonly metricGroups: Readonly<
    Record<
      "market" | "company" | "financial" | "risk" | "expectations",
      readonly EditorialVisualMetric[]
    >
  >;
  readonly evidenceBalance: EditorialEvidenceBalance;
  readonly decisionPaths: readonly EditorialDecisionPath[];
  readonly valuationFramework?: {
    readonly archetype: string;
    readonly method: string;
    readonly note: string;
    readonly summary: string;
    readonly capabilities: readonly {
      readonly key: string;
      readonly label: string;
      readonly status: "measured" | "derived" | "context_only" | "unavailable";
    }[];
    readonly scenarios: readonly {
      readonly id: "downside" | "base" | "upside";
      readonly label: string;
      readonly impliedPrice?: string;
      readonly returnPercent?: string;
      readonly requiredMetric: string;
      readonly requiredValue?: string;
      readonly assumptions: readonly string[];
    }[];
  };
};

function localized(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

function present(value: string, locale: Locale): string {
  if (locale === "ko")
    return value
      .replace(
        /반등 가능성은 있으나 기본 시나리오는 아닙니다\.?/gu,
        "과매도 반등 가능성은 열려 있지만, 지속 반등을 확인할 근거는 아직 부족합니다.",
      )
      .replace(/기본 시나리오는/gu, "현재 증거가 가리키는 전망은")
      .replace(/기본 시나리오/gu, "현재 전망")
      .replace(/봉인된 스냅샷/gu, "분석 기준 시점의 공식 자료")
      .replace(
        /(?:적격 )?(?:피어|동종기업) 데이터가 (?:훼손됐|손상됐|잘못됐|사용 불가능하)고?/gu,
        "동종기업 비교는 현재 판단의 핵심 근거로 사용하지 않았고",
      )
      .replace(/거시 스냅샷/gu, "거시 지표")
      .replace(/(?:근거|데이터) 스냅샷/gu, "확인된 근거")
      .replace(/스냅샷/gu, "근거 묶음")
      .trim();
  return value
    .replace(
      /a rebound is possible, but it is not the base case\.?/giu,
      "A relief rebound remains possible, but evidence does not yet confirm a durable reversal.",
    )
    .replace(/the base case is/giu, "Current evidence points to")
    .replace(/base case/giu, "current outlook")
    .replace(
      /sealed snapshot/giu,
      "official evidence available at the report cutoff",
    )
    .replace(
      /(?:qualified )?(?:peer|comparator) data (?:is|was) (?:malformed|corrupt|damaged|unusable)/giu,
      "peer comparison was not used as a decisive input",
    )
    .replace(/macro snapshot/giu, "macro indicators")
    .replace(/(?:evidence|data) snapshot/giu, "verified evidence")
    .replace(/snapshot/giu, "evidence set")
    .trim();
}

function presentLocalized(value: LocalizedText, locale: Locale): string {
  return present(localized(value, locale), locale);
}

function removeFalsePriceAbsence(value: string, locale: Locale): string {
  const cleaned =
    locale === "ko"
      ? value
          .replace(
            /\s*(?:하지만|다만|그러나),?\s*[^.!?。！？]*(?:현재\s*(?:주가|가격)|현\s*주가|가격[·/]밸류에이션)[^.!?。！？]*(?:없|부재|판단할 수 없|확인할 수 없)[.!?。！？]?/giu,
            "",
          )
          .replace(
            /[^.!?。！？]*(?:현재\s*(?:주가|가격)|현\s*주가)[^.!?。！？]*(?:없|부재|확인할 수 없)[.!?。！？]?/giu,
            "",
          )
      : value
          .replace(
            /\s*(?:but|however),?\s*[^.!?]*(?:current (?:share )?price|price and valuation)[^.!?]*(?:unavailable|not available|cannot (?:be )?(?:assessed|determined))[.!?]?/giu,
            "",
          )
          .replace(
            /[^.!?]*current (?:share )?price[^.!?]*(?:unavailable|not available)[.!?]?/giu,
            "",
          );
  return cleaned.replace(/\s{2,}/gu, " ").trim();
}

function combineDistinct(first: string, second: string): string {
  if (first.includes(second)) return first;
  if (second.includes(first)) return second;
  const separator = /[.!?。！？]$/u.test(first) ? " " : ". ";
  return `${first}${separator}${second}`;
}

function sentences(value: string): readonly string[] {
  return (
    value
      .replace(/\s+/gu, " ")
      .trim()
      // Split only at an actual prose boundary. Decimal values such as 4.65%
      // must remain whole when a row is compacted.
      .split(/(?<=[.!?。！？])\s+/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0) ?? []
  );
}

/**
 * Preserve complete sentences while removing the repeated supporting prose that
 * already appears in another report register. This deliberately never clips a
 * sentence in the middle: prices, ratios, and evidence identifiers stay
 * readable rather than becoming an ellipsis-led summary.
 */
function compactEditorialText(value: string, maxSentences: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  const parts = sentences(normalized);
  if (parts.length === 0 || parts.length <= maxSentences) return normalized;
  return parts.slice(0, maxSentences).join(" ");
}

function normalizedComparableText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function editorialTokens(value: string): ReadonlySet<string> {
  const stopwords = new Set([
    "그리고",
    "그러나",
    "대한",
    "현재",
    "합니다",
    "있습니다",
    "the",
    "and",
    "but",
    "for",
    "from",
    "that",
    "this",
    "with",
  ]);
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, " ")
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopwords.has(token)),
  );
}

function editoriallySimilar(first: string, second: string): boolean {
  const normalizedFirst = normalizedComparableText(first);
  const normalizedSecond = normalizedComparableText(second);
  if (normalizedFirst.length === 0 || normalizedSecond.length === 0)
    return false;
  if (
    normalizedFirst.includes(normalizedSecond) ||
    normalizedSecond.includes(normalizedFirst)
  )
    return true;

  const firstTokens = editorialTokens(first);
  const secondTokens = editorialTokens(second);
  const smallerSize = Math.min(firstTokens.size, secondTokens.size);
  if (smallerSize < 3) return false;
  const overlap = [...firstTokens].filter((token) =>
    secondTokens.has(token),
  ).length;
  return overlap / smallerSize >= 0.64;
}

function dedupeEditorialTexts(values: readonly string[]): string[] {
  const distinct: string[] = [];
  for (const value of values) {
    const compact = compactEditorialText(value, 2);
    if (
      compact.length > 0 &&
      !distinct.some((candidate) => editoriallySimilar(candidate, compact))
    )
      distinct.push(compact);
  }
  return distinct;
}

function optionalDistinctText(value: string, reference: string): string {
  const compact = compactEditorialText(value, 1);
  return compact.length === 0 || editoriallySimilar(compact, reference)
    ? ""
    : compact;
}

function editorialMetricValue(
  metric: NonNullable<ResearchFileData["metricSnapshot"]>["metrics"][number],
  locale: Locale,
): string {
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  if (metric.unit === "percent")
    return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%`;
  if (metric.unit === "multiple")
    return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}${locale === "ko" ? "배" : "x"}`;
  if (metric.unit === "USD_per_share")
    return `$${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 2 })}`;
  if (metric.unit === "USD") return compactUsd(metric.value, locale);
  return editorialStandardFormatters[locale].format(metric.value);
}

function investmentModelValue(
  value: number,
  unit: "USD_per_share" | "percent" | "multiple",
  locale: Locale,
): string {
  if (unit === "USD_per_share")
    return `$${value.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 2 })}`;
  if (unit === "percent") return `${value.toFixed(1).replace(/\.0$/u, "")}%`;
  return `${value.toFixed(1).replace(/\.0$/u, "")}${locale === "ko" ? "배" : "x"}`;
}

function valuationFrameworkFor(
  investmentModel: NonNullable<
    NonNullable<ResearchFileData["metricSnapshot"]>["investmentModel"]
  >,
  locale: Locale,
): NonNullable<ResearchFileEditorialModel["valuationFramework"]> {
  const ko = locale === "ko";
  return {
    archetype: investmentModel.archetypeLabel[locale],
    method: investmentModel.methodLabel[locale],
    note: investmentModel.methodNote[locale],
    summary: investmentModel.summary[locale],
    capabilities: investmentModel.capabilities.map((item) => ({
      key: item.key,
      label: item.label[locale],
      status: item.status,
    })),
    scenarios: investmentModel.scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label[locale],
      ...(scenario.impliedPrice === undefined
        ? {}
        : {
            impliedPrice: `$${scenario.impliedPrice.toLocaleString(
              ko ? "ko-KR" : "en-US",
              { maximumFractionDigits: 2 },
            )}`,
          }),
      ...(scenario.returnPercent === undefined
        ? {}
        : {
            returnPercent: `${scenario.returnPercent >= 0 ? "+" : ""}${scenario.returnPercent.toFixed(1)}%`,
          }),
      requiredMetric: scenario.requiredMetric[locale],
      ...(scenario.requiredValue === undefined ||
      scenario.requiredUnit === undefined
        ? {}
        : {
            requiredValue: investmentModelValue(
              scenario.requiredValue,
              scenario.requiredUnit,
              locale,
            ),
          }),
      assumptions: scenario.assumptions.map((item) => item[locale]),
    })),
  };
}

function metricProof(
  file: ResearchFileData,
  locale: Locale,
  ids: readonly string[],
): string {
  const metrics = file.metricSnapshot?.metrics ?? [];
  return ids
    .flatMap((id) => {
      const metric = metrics.find(
        (candidate) => candidate.id === id || candidate.id.startsWith(`${id}:`),
      );
      return metric === undefined
        ? []
        : [`${metric.label[locale]} ${editorialMetricValue(metric, locale)}`];
    })
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 2)
    .join(" · ");
}

function comparisonInterpretation(input: {
  readonly teamEvidence: string;
  readonly checkpoint: string;
}): string {
  const withoutGenericHedge = (value: string) =>
    value.replace(
      /^(?:조건부로|제한적으로|신중하게|conditionally|cautiously)(?:[,:：-]\s*|\s+)/iu,
      "",
    );
  const teamEvidence = withoutGenericHedge(
    compactEditorialText(input.teamEvidence, 1),
  );
  const checkpoint = compactEditorialText(input.checkpoint, 1);
  const dynamicEvidence =
    teamEvidence.length >= 32 &&
    !/^(?:조건부로|제한적으로|신중하게|지지한다|지지합니다|중립|긍정|부정|conditionally|cautiously|support(?:s|ed)?|neutral|positive|negative)[.!。\s]*$/iu.test(
      teamEvidence,
    )
      ? teamEvidence
      : checkpoint;
  const concise = dedupeEditorialTexts([dynamicEvidence, checkpoint])
    .slice(0, 2)
    .join(" ");
  if (concise.length > 45) return concise;
  return dedupeEditorialTexts([
    withoutGenericHedge(compactEditorialText(input.teamEvidence, 2)),
    compactEditorialText(input.checkpoint, 2),
  ])
    .slice(0, 2)
    .join(" ");
}

function compactScenarioAssumption(value: string): string {
  return value
    .replace(
      /\s*[·|]\s*(?:FY\d{4}\s*(?:scenario|outlook)|FY\d{4}\s*시나리오|시나리오)$/giu,
      "",
    )
    .trim();
}

function claimDepartment(
  claim: string,
): ResearchFileData["teamViews"][number]["departmentId"] {
  if (
    /규제|통상|제재|정책|경쟁|경영진|공급망|하방|regulat|trade|sanction|policy|competition|management|supply chain|downside/iu.test(
      claim,
    )
  )
    return "risk";
  if (
    /영업이익률|주당이익|\beps\b|현금흐름|희석|부채|재무|이익률|밸류에이션|가치평가|배수|\bper\b|p\/e|valuation|multiple|operating margin|cash flow|dilut|debt|financial/iu.test(
      claim,
    )
  )
    return "financial";
  if (
    /추세|금리|수급|\brsi\b|\bmacd\b|이동평균|모멘텀|변동성|국채|trend|yield|moving average|momentum|volatility|technical|market regime/iu.test(
      claim,
    )
  )
    return "market";
  if (
    /제품|매출|고객|수요|판매량|가격결정력|인도|점유율|product|revenue|customer|demand|unit|pricing power|deliver|market share/iu.test(
      claim,
    )
  )
    return "company";
  return "company";
}

function departmentThesisTitle(
  department: ResearchFileData["teamViews"][number]["departmentId"],
  locale: Locale,
): string {
  const titles = {
    company: {
      en: "Can demand and product strength support the price?",
      ko: "수요·제품 경쟁력이 가격을 지지하는가",
    },
    financial: {
      en: "Does growth convert into earnings and cash?",
      ko: "성장이 실제 이익과 현금으로 이어지는가",
    },
    market: {
      en: "Do price, rates, and flows confirm the view?",
      ko: "가격·금리·수급은 판단을 지지하는가",
    },
    risk: {
      en: "Which downside condition would break the thesis?",
      ko: "어떤 하방 조건이 핵심 논지를 무너뜨리는가",
    },
  } as const;
  return titles[department][locale];
}

function claimEditorialScore(
  claim: NonNullable<ResearchFileData["claimMatrix"]>[number],
): number {
  const strengthScore = {
    strong: 40,
    moderate: 30,
    limited: 15,
    contested: 8,
    unverified: 0,
  } as const;
  const verdictScore =
    claim.verdict === "entailed"
      ? 20
      : claim.verdict === "partial"
        ? 12
        : claim.verdict === "contradicted"
          ? 8
          : 0;
  return strengthScore[claim.strength] + verdictScore + claim.sourceCount;
}

function readerEvidenceLabel(
  publisher: string,
  title: string,
  locale: Locale,
): { readonly publisher: string; readonly title: string } {
  const publicLabel = publicEvidenceLabel(publisher, title, locale);
  if (publicLabel.publisher !== publisher || publicLabel.title !== title)
    return publicLabel;
  if (locale === "ko") {
    if (/U\.?S\.? Treasury/iu.test(publisher))
      return {
        publisher: "미국 재무부",
        title: /yield curve/iu.test(title)
          ? "국채 수익률 곡선"
          : present(title, locale),
      };
    if (/NASDAQ/iu.test(publisher))
      return {
        publisher: "나스닥",
        title: /quote/iu.test(title)
          ? "공식 가격"
          : /indicator/iu.test(title)
            ? "기술 지표"
            : /price bars?/iu.test(title)
              ? "가격 흐름"
              : present(title, locale),
      };
    if (/SEC(?:\s+EDGAR)?/iu.test(publisher))
      return {
        publisher: "미국 증권거래위원회",
        title: /\b10-Q\b/iu.test(title)
          ? "10-Q 분기 공시"
          : /\b10-K\b/iu.test(title)
            ? "10-K 연차 공시"
            : /\b8-K\b/iu.test(title)
              ? "8-K 주요 공시"
              : "기업 공시",
      };
    if (/Bureau of Labor Statistics/iu.test(publisher))
      return {
        publisher: "미국 노동통계국",
        title: /unemployment/iu.test(title)
          ? "실업률"
          : /cpi|consumer price/iu.test(title)
            ? "소비자물가지수"
            : "공식 고용·물가 지표",
      };
  }
  return { publisher, title };
}

function claimEvidence(
  file: ResearchFileData,
  claim: NonNullable<ResearchFileData["claimMatrix"]>[number],
  locale: Locale,
): string {
  const department = claimDepartment(presentLocalized(claim.claim, locale));
  const metricIds = {
    market: [
      "current_price",
      "relative_performance_3m",
      "relative_performance_1y",
      "peer_premium",
    ],
    company: [
      "revenue_growth",
      "segment_share",
      "forward_revenue",
      "gross_margin",
    ],
    financial: ["revenue_growth", "operating_margin", "free_cash_flow", "roic"],
    risk: ["cash", "net_debt", "inventory", "region_share"],
  } as const;
  const quantifiedProof = metricProof(file, locale, metricIds[department]);
  if (quantifiedProof.length > 0) return quantifiedProof;
  const linkedSourceCount = claim.sourceRefs
    .map((sourceId) =>
      file.evidenceIndex.find((source) => source.id === sourceId),
    )
    .filter((source) => source !== undefined).length;
  if (linkedSourceCount === 0)
    return locale === "ko"
      ? "주장 단위 근거가 아직 연결되지 않았습니다."
      : "Claim-level evidence is not yet linked.";
  return locale === "ko"
    ? `연결 근거 ${linkedSourceCount}건을 주장 단위로 교차 확인했습니다.`
    : `${linkedSourceCount} linked evidence items were cross-checked at claim level.`;
}

function conclusionIndex(file: ResearchFileData): number {
  const voteScores = {
    support: 100,
    support_with_reservations: 70,
    oppose: 15,
    abstain: 50,
  } as const;
  const teamScore =
    file.teamViews.reduce((sum, team) => sum + voteScores[team.vote], 0) /
    Math.max(file.teamViews.length, 1);
  const claimScores = (file.claimMatrix ?? []).map((claim) => {
    if (claim.verdict === "contradicted") return 20;
    if (claim.verdict === "not_assessable") return 50;
    if (claim.verdict === "partial")
      return claim.strength === "moderate" || claim.strength === "strong"
        ? 65
        : 55;
    if (claim.strength === "strong") return 90;
    if (claim.strength === "moderate") return 78;
    return 68;
  });
  const claimScore =
    claimScores.length === 0
      ? 50
      : claimScores.reduce((sum, score) => sum + score, 0) / claimScores.length;
  const postureScore =
    file.posture === "positive" ? 85 : file.posture === "caution" ? 40 : 55;
  if (file.researchTarget?.kind === "department") {
    const claims = file.claimMatrix ?? [];
    const confidence =
      claims.length === 0
        ? 50
        : claims.reduce(
            (sum, claim) =>
              sum + Math.min(100, (claimEditorialScore(claim) / 65) * 100),
            0,
          ) / claims.length;
    const uniqueSources = new Set(claims.flatMap((claim) => claim.sourceRefs))
      .size;
    const breadth = Math.min(100, 50 + uniqueSources * 6);
    const reservationPenalty =
      (claims.filter((claim) => claim.counterpoint !== undefined).length /
        Math.max(claims.length, 1)) *
      10;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          teamScore * 0.32 +
            confidence * 0.42 +
            breadth * 0.26 -
            reservationPenalty,
        ),
      ),
    );
  }
  return Math.round(teamScore * 0.4 + claimScore * 0.35 + postureScore * 0.25);
}

function reliability(file: ResearchFileData): number {
  if (file.researchTarget?.kind === "department") {
    const departmentId = file.researchTarget.departmentId;
    const claims = file.claimMatrix ?? [];
    const ownedClaims = claims.filter(
      (claim) =>
        claim.roleOwner !== undefined &&
        workflowRoleById(claim.roleOwner)?.departmentId === departmentId,
    );
    const scopedClaims = ownedClaims.length > 0 ? ownedClaims : claims;
    if (scopedClaims.length > 0) {
      const strengthScore = {
        strong: 96,
        moderate: 84,
        limited: 66,
        contested: 56,
        unverified: 32,
      } as const;
      const averageStrength =
        scopedClaims.reduce(
          (total, claim) => total + strengthScore[claim.strength],
          0,
        ) / scopedClaims.length;
      const evidenceCoverage =
        (scopedClaims.filter(
          (claim) =>
            claim.sourceRefs.length > 0 ||
            (claim.evidenceArtifactIds?.length ?? 0) > 0,
        ).length /
          scopedClaims.length) *
        100;
      const linkedSourceIds = new Set(
        scopedClaims.flatMap((claim) => [
          ...claim.sourceRefs,
          ...(claim.evidenceArtifactIds ?? []),
        ]),
      );
      const linkedSources = file.evidenceIndex.filter((source) =>
        linkedSourceIds.has(source.id),
      );
      const freshnessScore =
        linkedSources.length === 0
          ? evidenceCoverage > 0
            ? 78
            : 45
          : linkedSources.reduce(
              (total, source) =>
                total +
                (source.freshness === "current"
                  ? 100
                  : source.freshness === "stale"
                    ? 68
                    : source.freshness === "unavailable"
                      ? 40
                      : 82),
              0,
            ) / linkedSources.length;
      return Math.round(
        Math.max(
          0,
          Math.min(
            100,
            averageStrength * 0.45 +
              evidenceCoverage * 0.35 +
              freshnessScore * 0.2,
          ),
        ),
      );
    }
  }
  if (file.qualityScorecard !== undefined)
    return Math.round(
      (file.qualityScorecard.evidenceCoverage +
        file.qualityScorecard.freshnessCoverage +
        file.qualityScorecard.rebuttalResolution) /
        3,
    );
  return file.evidenceScore.denominator === 0
    ? 0
    : Math.round(
        (file.evidenceScore.passed / file.evidenceScore.denominator) * 100,
      );
}

function visualMetric(
  metric: NonNullable<ResearchFileData["metricSnapshot"]>["metrics"][number],
  locale: Locale,
): EditorialVisualMetric {
  const representsNetCash = metric.id === "net_debt" && metric.value < 0;
  const barPercent =
    metric.unit === "percent" && metric.value >= 0 && metric.value <= 100
      ? metric.value
      : undefined;
  return {
    id: metric.id,
    label: representsNetCash
      ? locale === "ko"
        ? "순현금"
        : "Net cash"
      : metric.label[locale],
    value: editorialMetricValue(
      representsNetCash ? { ...metric, value: Math.abs(metric.value) } : metric,
      locale,
    ),
    category: metric.category,
    signal: metric.signal,
    ...(barPercent === undefined ? {} : { barPercent }),
  };
}

const METRIC_PRIORITY = {
  market: [
    "current_price",
    "daily_change_percent",
    "market_cap",
    "relative_performance_3m",
    "relative_performance_1y",
    "pe",
    "ev_ebitda",
    "peer_premium",
  ],
  company: [
    "revenue_growth",
    "revenue_ttm",
    "segment_share",
    "forward_revenue",
    "gross_margin",
  ],
  financial: [
    "revenue_growth",
    "gross_margin",
    "operating_margin",
    "free_cash_flow",
    "operating_cash_flow",
    "net_income",
    "eps_ttm",
    "net_margin",
    "capital_expenditures",
    "roe",
    "roic",
    "forward_pe",
    "pe",
  ],
  risk: [
    "net_debt",
    "cash",
    "total_assets",
    "total_equity",
    "debt_to_equity",
    "inventory",
    "diluted_shares",
    "region_share",
    "peer_premium",
  ],
  expectations: [
    "forward_revenue",
    "forward_eps",
    "forward_pe",
    "price_target_median",
    "price_target_high",
    "price_target_low",
    "price_target_count",
    "latest_eps_actual",
    "latest_eps_surprise",
    "next_eps_forecast",
    "latest_revenue_actual",
    "latest_revenue_surprise",
    "next_revenue_forecast",
    "recommendation_buy",
    "recommendation_hold",
    "recommendation_sell",
  ],
} as const;

function metricGroups(
  file: ResearchFileData,
  locale: Locale,
): ResearchFileEditorialModel["metricGroups"] {
  const metrics = file.metricSnapshot?.metrics ?? [];
  const take = (
    category: keyof typeof METRIC_PRIORITY,
  ): readonly EditorialVisualMetric[] => {
    const priority = METRIC_PRIORITY[category];
    return [...metrics]
      .filter((metric) =>
        priority.some(
          (id) => metric.id === id || metric.id.startsWith(`${id}:`),
        ),
      )
      .sort((first, second) => {
        const firstIndex = priority.findIndex(
          (id) => first.id === id || first.id.startsWith(`${id}:`),
        );
        const secondIndex = priority.findIndex(
          (id) => second.id === id || second.id.startsWith(`${id}:`),
        );
        return firstIndex - secondIndex;
      })
      .filter(
        (metric, index, values) =>
          values.findIndex((candidate) => candidate.id === metric.id) === index,
      )
      .slice(0, 7)
      .map((metric) => visualMetric(metric, locale));
  };
  return {
    market: take("market"),
    company: take("company"),
    financial: take("financial"),
    risk: take("risk"),
    expectations: take("expectations"),
  };
}

function evidenceBalance(
  file: ResearchFileData,
  locale: Locale,
): EditorialEvidenceBalance {
  const claims = file.claimMatrix ?? [];
  const challengedClaims = claims.filter(
    (claim) =>
      claim.verdict === "contradicted" || claim.strength === "contested",
  );
  const supported = claims.filter(
    (claim) =>
      claim.verdict === "entailed" &&
      (claim.strength === "strong" || claim.strength === "moderate"),
  ).length;
  const partial = claims.filter(
    (claim) =>
      !challengedClaims.includes(claim) &&
      (claim.verdict === "partial" ||
        (claim.verdict === "entailed" && claim.strength === "limited")),
  ).length;
  const challenged = challengedClaims.length;
  const unverified = claims.filter(
    (claim) =>
      !challengedClaims.includes(claim) &&
      (claim.verdict === "not_assessable" || claim.strength === "unverified"),
  ).length;
  const total = Math.max(
    claims.length,
    supported + partial + challenged + unverified,
  );
  const assigned = supported + partial + challenged + unverified;
  const normalizedUnverified = unverified + Math.max(0, total - assigned);
  const rows = [
    {
      id: "supported" as const,
      label: locale === "ko" ? "확인" : "Supported",
      count: supported,
    },
    {
      id: "partial" as const,
      label: locale === "ko" ? "부분 확인" : "Partial",
      count: partial,
    },
    {
      id: "challenged" as const,
      label: locale === "ko" ? "상충" : "Challenged",
      count: challenged,
    },
    {
      id: "unverified" as const,
      label: locale === "ko" ? "미확인" : "Unverified",
      count: normalizedUnverified,
    },
  ];
  return {
    total,
    supported,
    partial,
    challenged,
    unverified: normalizedUnverified,
    segments: rows.map((row) => ({
      ...row,
      percent: total === 0 ? 0 : Math.round((row.count / total) * 100),
    })),
  };
}

function sourceGroups(
  file: ResearchFileData,
  evidenceIndex: readonly EditorialSource[],
  locale: Locale,
): readonly EditorialSourceGroup[] {
  const focused = file.researchTarget?.kind === "department";
  const claims = file.claimMatrix ?? [];
  const coreSourceIds = new Set(
    claims.slice(0, 2).flatMap((claim) => claim.sourceRefs),
  );
  const debateSourceIds = new Set(
    claims
      .filter(
        (claim) =>
          claim.counterpoint !== undefined ||
          claim.verdict === "partial" ||
          claim.verdict === "contradicted",
      )
      .flatMap((claim) => claim.sourceRefs),
  );
  const auditedSourceIds = new Set(claims.flatMap((claim) => claim.sourceRefs));
  const businessPattern =
    /sec|filing|company|fundamental|earnings|transcript|revenue|margin|xbrl/iu;
  const valuationPattern =
    /market|price|technical|treasury|yield|peer|benchmark|cross.?asset|rapidapi/iu;
  const groups: EditorialSourceGroup[] = [
    {
      number: "01",
      title: locale === "ko" ? "판단 요약" : "Decision summary",
      purpose:
        locale === "ko"
          ? "직접 답변과 핵심 판단을 지지한 우선 근거"
          : "Priority evidence supporting the direct answer and headline judgment",
      sources: evidenceIndex.filter((source) => coreSourceIds.has(source.id)),
    },
    {
      number: "02",
      title: focused
        ? locale === "ko"
          ? "팀 핵심 논지"
          : "Team findings"
        : locale === "ko"
          ? "사업·실적·핵심 논지"
          : "Business & earnings",
      purpose: focused
        ? locale === "ko"
          ? "선택 팀이 핵심 판단을 만드는 데 사용한 전문 근거"
          : "Specialist evidence used by the selected team to form its view"
        : locale === "ko"
          ? "사업 구조, 성장, 수익성과 기업 고유 위험을 확인한 자료"
          : "Evidence used to assess the business, growth, profitability, and issuer-specific risks",
      sources: evidenceIndex.filter((source) =>
        businessPattern.test(
          `${source.sourceClass} ${source.publisher} ${source.title}`,
        ),
      ),
    },
    {
      number: "03",
      title: focused
        ? locale === "ko"
          ? "검증 범위·다음 확인"
          : "Scope & next proof"
        : locale === "ko"
          ? "밸류에이션·기업 비교"
          : "Valuation & comparison",
      purpose: focused
        ? locale === "ko"
          ? "선택 팀의 검증 범위와 다음 확인 조건에 연결된 자료"
          : "Evidence linked to the selected team's scope and next proof conditions"
        : locale === "ko"
          ? "가격, 기술 흐름, 금리, 동종기업과 상대 비교에 사용한 자료"
          : "Market, technical, rates, peer, and relative-valuation evidence",
      sources: evidenceIndex.filter((source) =>
        valuationPattern.test(
          `${source.sourceClass} ${source.publisher} ${source.title}`,
        ),
      ),
    },
    {
      number: "04",
      title: focused
        ? locale === "ko"
          ? "팀 내부 합의·보존 이견"
          : "Team agreement & retained dissent"
        : locale === "ko"
          ? "에이전트 토론·최종 판정"
          : "Debate & final judgment",
      purpose: focused
        ? locale === "ko"
          ? "팀원 간 재검토와 합의 형성에 다시 사용된 근거"
          : "Evidence revisited during specialist review and team consolidation"
        : locale === "ko"
          ? "반론, 재검증, 의장 판정에 다시 사용된 감사 근거"
          : "Audited evidence revisited during challenge, recheck, and chair synthesis",
      sources: evidenceIndex.filter((source) => debateSourceIds.has(source.id)),
    },
  ];
  const used = new Set(
    groups.flatMap((group) => group.sources.map((source) => source.id)),
  );
  const unassigned = evidenceIndex.filter((source) => !used.has(source.id));
  if (unassigned.length > 0) {
    const decision = groups[0];
    if (decision !== undefined)
      groups[0] = {
        ...decision,
        sources: [...decision.sources, ...unassigned],
      };
  }
  return groups.map((group) => {
    const chapterFallback =
      group.number === "04"
        ? evidenceIndex.filter((source) => auditedSourceIds.has(source.id))
        : [];
    const chapterSources =
      group.sources.length > 0 ? group.sources : chapterFallback;
    return {
      ...group,
      sources: chapterSources.filter(
        (source, index, sources) =>
          sources.findIndex((candidate) => candidate.id === source.id) ===
          index,
      ),
    };
  });
}

function callout(
  value: string,
  supportingCopy: string | undefined,
  fallback: string,
): EditorialCallout {
  const normalized = value.trim();
  const boundary = normalized.match(/^.*?[.!?。！？](?:\s|$)/u)?.[0]?.trim();
  const normalizedHeadline = boundary ?? normalized;
  const remainder =
    boundary === undefined ? "" : normalized.slice(boundary.length).trim();
  const normalizedBody = (remainder || supportingCopy || fallback).trim();
  return {
    headline: normalizedHeadline,
    body:
      normalizedBody === normalizedHeadline ? fallback.trim() : normalizedBody,
  };
}

function lowValueEditorialCopy(value: string): boolean {
  return /(?:근거가 (?:이 논지를 )?(?:일부만 )?지지|연결 근거 \d+건|주장 단위 근거|linked evidence|evidence (?:only partially )?supports|claim-level evidence)/iu.test(
    value,
  );
}

function distinctCallouts(
  values: readonly string[],
  candidateGroups: readonly (readonly string[])[],
  fallback: string,
): readonly EditorialCallout[] {
  const usedBodies: string[] = [];
  return values.map((value, index) => {
    const initial = callout(value, undefined, fallback);
    const candidates = [
      ...(candidateGroups[index] ?? []),
      initial.body,
      ...candidateGroups.flat(),
      fallback,
    ]
      .map((candidate) => compactEditorialText(candidate, 1))
      .filter(
        (candidate) =>
          candidate.length > 0 &&
          !lowValueEditorialCopy(candidate) &&
          !editoriallySimilar(candidate, initial.headline),
      );
    const body =
      candidates.find(
        (candidate) =>
          !usedBodies.some((used) => editoriallySimilar(used, candidate)),
      ) ??
      candidates[0] ??
      fallback;
    usedBodies.push(body);
    return { headline: initial.headline, body };
  });
}

function buildWorkflowV2EditorialModel(
  file: ResearchFileData,
  locale: Locale,
): ResearchFileEditorialModel | undefined {
  const structured = file.structuredEditorial;
  if (file.presentationVersion !== "workflow-v2" || structured === undefined)
    return undefined;
  const ko = locale === "ko";
  const text = (value: LocalizedText) => value[locale];
  const displayClaims = structured.claims.filter((claim, index, claims) =>
    claims
      .slice(0, index)
      .every(
        (previous) =>
          !editoriallySimilar(
            text(previous.publicThesis),
            text(claim.publicThesis),
          ),
      ),
  );
  const sectionCopy = (
    item: ResearchFileData["analysis"][number] | undefined,
  ) =>
    item === undefined
      ? ""
      : dedupeEditorialTexts([text(item.summary), text(item.detail)]).join(" ");
  const narrativeById = (id: string) =>
    structured.sectionNarratives?.find((section) => section.id === id)?.body[
      locale
    ] ?? "";
  const sectionMatching = (pattern: RegExp, fallbackIndex: number) =>
    file.analysis.find((item) => pattern.test(text(item.title))) ??
    file.analysis[fallbackIndex];
  const supportedSection = sectionMatching(/supported|analysis|판단|분석/iu, 0);
  const valuationSection = sectionMatching(
    /valuation|comparison|expectation|밸류|가치|비교|기대/iu,
    1,
  );
  const operatingSection = sectionMatching(
    /operat|scenario|path|실적|운영|시나리오|경로/iu,
    2,
  );
  const distinctCandidate = (
    candidates: readonly (string | undefined)[],
    references: readonly string[],
  ) =>
    candidates
      .map((candidate) => compactEditorialText(candidate ?? "", 2))
      .find(
        (candidate) =>
          candidate.length > 0 &&
          references.every(
            (reference) =>
              reference.length === 0 ||
              !editoriallySimilar(candidate, reference),
          ),
      ) ?? "";
  const teams: readonly EditorialTeamRow[] = file.teamViews.map((team) => ({
    departmentId: team.departmentId,
    teamName: text(team.teamName),
    vote: team.vote,
    strongestClaim: text(team.position),
    evidence: text(team.rationale),
    portraitPath: `/research/office-v7/portraits/${team.departmentId}.png`,
  }));
  const supportClaims = displayClaims.filter(
    (claim) => claim.stanceContribution === "supports",
  );
  const opposingClaims = displayClaims.filter(
    (claim) => claim.stanceContribution === "opposes",
  );
  const usedClaimEvidence: string[] = [];
  const usedCounterpoints: string[] = [];
  const claimRows: readonly EditorialAnalysisRow[] = displayClaims.map(
    (claim, index) => {
      const thesis = text(claim.publicThesis);
      const checkpoint = text(claim.falsifier);
      const role = workflowRoleById(claim.roleOwner);
      const team = teams.find(
        (candidate) => candidate.departmentId === role?.departmentId,
      );
      const oppositePool =
        claim.stanceContribution === "opposes" ? supportClaims : opposingClaims;
      const opposite = oppositePool[index % Math.max(oppositePool.length, 1)];
      const counterpoint = distinctCandidate(
        [
          opposite === undefined ? undefined : text(opposite.publicThesis),
          text(structured.decision.strongestCountercase),
          team?.strongestClaim,
          checkpoint,
        ],
        [thesis, ...usedCounterpoints],
      );
      const dimensionSection =
        claim.decisionDimension === "embedded_expectations"
          ? valuationSection
          : ["catalyst", "leading_indicator", "downside_path"].includes(
                claim.decisionDimension,
              )
            ? operatingSection
            : supportedSection;
      const evidence = distinctCandidate(
        [
          dimensionSection === undefined
            ? undefined
            : text(dimensionSection.detail),
          dimensionSection === undefined
            ? undefined
            : text(dimensionSection.summary),
          team?.evidence,
          sectionCopy(file.analysis[index % Math.max(file.analysis.length, 1)]),
        ],
        [thesis, counterpoint, checkpoint, ...usedClaimEvidence],
      );
      const resolvedEvidence = evidence || team?.evidence || thesis;
      const resolvedCounterpoint = counterpoint || checkpoint;
      usedClaimEvidence.push(resolvedEvidence);
      usedCounterpoints.push(resolvedCounterpoint);
      return {
        id: claim.claimId,
        title: publicDecisionDimensionLabel(claim.decisionDimension, locale),
        agentView: thesis,
        evidence: resolvedEvidence,
        counterpoint: resolvedCounterpoint,
        checkpoint,
        evidenceId: claim.claimId,
        strength:
          file.claimMatrix?.find((candidate) => candidate.id === claim.claimId)
            ?.strength ?? "moderate",
      };
    },
  );
  const qualification = file.metricSnapshot?.comparatorQualification;
  const qualifiedRows =
    qualification?.status === "qualified"
      ? qualification.rows.filter((row) => row.displayEligibility)
      : [];
  const qualifiedComparisonRows: readonly EditorialComparisonRow[] =
    qualifiedRows.map((row) => ({
      label: row.name,
      companyView: row.normalizedMetrics
        .map(
          (metric) =>
            `${metric.key}: ${metric.value} ${metric.unit} (${metric.period})`,
        )
        .join(" · "),
      benchmarkLens: row.rationale[locale],
      interpretation: row.normalizationNote ?? row.rationale[locale],
      ...(row.evidenceArtifactIds[0] === undefined
        ? {}
        : { evidenceId: row.evidenceArtifactIds[0] }),
    }));
  const valuationClaim = displayClaims.find(
    (claim) => claim.decisionDimension === "embedded_expectations",
  );
  const financialClaim = displayClaims.find((claim) =>
    ["margin", "margin_durability", "cash_conversion"].includes(
      claim.decisionDimension,
    ),
  );
  const comparisonRows = qualifiedComparisonRows;
  const groupedMetrics = metricGroups(file, locale);
  const sourceIndex = file.evidenceIndex.map((source) => ({
    ...source,
    ...readerEvidenceLabel(source.publisher, source.title, locale),
  }));
  const catalysts = displayClaims
    .filter((claim) => claim.decisionDimension === "catalyst")
    .map((claim) => ({
      headline: text(claim.publicThesis),
      body: text(claim.falsifier),
    }));
  const risks = displayClaims
    .filter((claim) =>
      ["downside_path", "leading_indicator"].includes(claim.decisionDimension),
    )
    .map((claim) => ({
      headline: text(claim.publicThesis),
      body: text(claim.falsifier),
    }));
  const sourceScenarios = file.scenarios.map((scenario) => ({
    id: scenario.id,
    label: text(scenario.label),
    thesis: text(scenario.thesis),
    assumptions: scenario.assumptions.flatMap((assumption) =>
      assumption.kind === "metric"
        ? [
            `${text(assumption.metric)} ${text(assumption.displayValue)} · ${text(assumption.basis)}`,
          ]
        : [],
    ),
  }));
  const scenarios = sourceScenarios;
  const conclusionIndex =
    structured.decision.stance === "upside_skewed"
      ? 75
      : structured.decision.stance === "wait_for_proof"
        ? 50
        : 25;
  const evidenceReliability = reliability(file);
  const directAnswer = text(structured.decision.decisiveReason);
  const tenSecondBrief = narrativeById("ten_second_brief").trim();
  // The decision reason and the ten-second brief are generated from the same
  // primary claim. Showing both made the opening read like a duplicated AI
  // summary. Prefer the fuller chair-owned brief and keep the decision reason
  // for the compact verdict metadata.
  const investmentView = [tenSecondBrief || directAnswer];
  const primaryClaim = structured.decision.primaryClaimIds.flatMap(
    (claimId) => {
      const claim = displayClaims.find(
        (candidate) => candidate.claimId === claimId,
      );
      return claim === undefined ? [] : [claim];
    },
  )[0];
  const primaryFalsifier =
    primaryClaim === undefined ? "" : text(primaryClaim.falsifier);
  const countercase = text(structured.decision.strongestCountercase);
  const valuationFramework =
    file.metricSnapshot?.investmentModel === undefined
      ? undefined
      : valuationFrameworkFor(file.metricSnapshot.investmentModel, locale);
  return {
    structuredDecision: structured.decision,
    structuredClaims: displayClaims,
    qualifiedComparators: structured.comparators,
    question: file.researchDirection ?? "",
    directAnswer,
    investmentView,
    posture: "",
    conclusionIndex,
    conclusionLabel: structured.decision.stance,
    evidenceReliability,
    headlineMetrics: [
      ...(file.marketSnapshot === undefined
        ? []
        : [
            {
              label: ko ? "현재가" : "Observed price",
              value: `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`,
            },
          ]),
    ],
    lensRows: structured.decision.primaryClaimIds.flatMap((claimId) => {
      const claim = displayClaims.find(
        (candidate) => candidate.claimId === claimId,
      );
      return claim === undefined
        ? []
        : [
            {
              label: publicDecisionDimensionLabel(
                claim.decisionDimension,
                locale,
              ),
              content: text(claim.publicThesis),
            },
          ];
    }),
    companySnapshot: [],
    catalysts,
    risks,
    coverage: file.coverage,
    analysisRows: claimRows,
    valuationConclusion:
      valuationClaim === undefined
        ? compactEditorialText(
            sectionCopy(valuationSection) ||
              text(
                financialClaim?.publicThesis ??
                  structured.decision.decisiveReason,
              ),
            3,
          )
        : text(valuationClaim.publicThesis),
    nextVerificationEvent:
      displayClaims.find((claim) => claim.decisionDimension === "catalyst")
        ?.publicThesis[locale] ?? "",
    comparisonRows,
    ...(qualification === undefined
      ? {}
      : { comparatorQualification: qualification }),
    scenarios,
    teamRows: teams,
    debates: [],
    initialView: directAnswer,
    finalView: directAnswer,
    acceptedClaims: supportClaims.map((claim) => text(claim.publicThesis)),
    preservedDissent: [
      countercase,
      ...opposingClaims.map((claim) => text(claim.publicThesis)),
    ],
    evidenceIndex: sourceIndex,
    sourceGroups: sourceGroups(file, sourceIndex, locale),
    visualMetrics: Object.values(groupedMetrics).flat(),
    metricGroups: groupedMetrics,
    evidenceBalance: evidenceBalance(file, locale),
    decisionPaths: [
      {
        id: "hold",
        label: ko ? "현재 판단" : "Current decision",
        headline: directAnswer,
        detail: countercase,
      },
      ...(primaryFalsifier.length === 0
        ? []
        : [
            {
              id: "invalidate" as const,
              label: ko ? "판단 무효화" : "Invalidation",
              headline: primaryFalsifier,
              detail: primaryFalsifier,
            },
          ]),
    ],
    ...(valuationFramework === undefined ? {} : { valuationFramework }),
  };
}

export function buildResearchFileEditorialModel(
  file: ResearchFileData,
  locale: Locale,
): ResearchFileEditorialModel {
  const workflowV2 = buildWorkflowV2EditorialModel(file, locale);
  if (workflowV2 !== undefined) return workflowV2;
  const ko = locale === "ko";
  const focusedDepartment =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const display = (value: LocalizedText) => {
    const presented = presentLocalized(value, locale);
    return file.marketSnapshot === undefined
      ? presented
      : removeFalsePriceAbsence(presented, locale);
  };
  const concerns = file.concerns.map(display).filter((item) => item.length > 0);
  const positives = file.positives
    .map(display)
    .filter((item) => item.length > 0);
  const question =
    file.researchDirection ??
    (ko
      ? "현재 공개 근거는 이 기업의 사업 경쟁력과 기대 수준을 어떻게 설명하는가?"
      : "How does current public evidence explain the company's business quality and embedded expectations?");
  const baseAnswer = display(file.thesis);
  const posture = localized(file.postureLabel, locale);
  const teamViews = file.teamViews.map((team) => ({
    departmentId: team.departmentId,
    teamName: localized(team.teamName, locale),
    vote: team.vote,
    strongestClaim: display(team.position),
    evidence: display(team.rationale),
    portraitPath: `/research/office-v7/portraits/${team.departmentId}.png`,
  }));
  const teamByDepartment = (
    departmentId: ResearchFileData["teamViews"][number]["departmentId"],
  ) => teamViews.find((team) => team.departmentId === departmentId);
  const financialTeam = teamByDepartment("financial");
  const riskTeam = teamByDepartment("risk");
  const companyTeam = teamByDepartment("company");
  const marketTeam = teamByDepartment("market");
  const fallbackAnalysis = [
    {
      title: { en: "Market expectations", ko: "시장 기대" },
      summary: file.expectation,
      detail: file.expectation,
    },
    {
      title: { en: "Valuation evidence", ko: "밸류에이션 근거" },
      summary: file.valuation,
      detail: file.valuation,
    },
    {
      title: { en: "Next validation event", ko: "다음 검증 이벤트" },
      summary: file.nextEvent,
      detail: file.nextEvent,
    },
    {
      title: { en: "Change condition", ko: "판단 변경 조건" },
      summary: file.changeCondition,
      detail: file.changeCondition,
    },
  ] satisfies readonly {
    readonly title: LocalizedText;
    readonly summary: LocalizedText;
    readonly detail: LocalizedText;
  }[];
  const analysisItems = [...file.analysis, ...fallbackAnalysis]
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            localized(candidate.title, locale) ===
            localized(item.title, locale),
        ) === index,
    )
    .slice(0, 6);
  const rankedClaims = [...(file.claimMatrix ?? [])].sort(
    (first, second) => claimEditorialScore(second) - claimEditorialScore(first),
  );
  const departmentOrder = ["company", "financial", "market", "risk"] as const;
  const primaryClaims = departmentOrder
    .map((department) => {
      const claim = rankedClaims.find(
        (candidate) =>
          claimDepartment(presentLocalized(candidate.claim, locale)) ===
          department,
      );
      return claim === undefined ? undefined : { claim, department };
    })
    .filter((item) => item !== undefined);
  const primaryIds = new Set(primaryClaims.map(({ claim }) => claim.id));
  const selectedClaims = [...primaryClaims];
  for (const claim of rankedClaims) {
    if (selectedClaims.length >= 4) break;
    if (primaryIds.has(claim.id)) continue;
    const claimText = presentLocalized(claim.claim, locale);
    if (
      selectedClaims.some(({ claim: selected }) =>
        editoriallySimilar(presentLocalized(selected.claim, locale), claimText),
      )
    )
      continue;
    selectedClaims.push({
      claim,
      department: claimDepartment(claimText),
    });
  }
  // A repetitive but audited claim is still preferable to an invented,
  // unverified filler row. Semantic diversity is the first pass; evidence
  // completeness is the final fallback.
  for (const claim of rankedClaims) {
    if (selectedClaims.length >= 4) break;
    if (selectedClaims.some(({ claim: selected }) => selected.id === claim.id))
      continue;
    selectedClaims.push({
      claim,
      department: claimDepartment(presentLocalized(claim.claim, locale)),
    });
  }
  const claimRows: EditorialAnalysisRow[] = selectedClaims.map(
    ({ claim, department }, index) => {
      const claimText = presentLocalized(claim.claim, locale);
      const claimSentences = sentences(claimText);
      const focusedDecision =
        claimSentences[0] ?? compactEditorialText(claimText, 1);
      const focusedEvidence =
        claimSentences.slice(1, 3).join(" ") ||
        claimEvidence(file, claim, locale);
      const rowDepartment = focusedDepartment ?? department;
      const relatedTeam = teamByDepartment(rowDepartment);
      const isPrimaryDepartmentClaim =
        focusedDepartment !== undefined
          ? index === 0
          : primaryClaims.find(
              ({ department: primary }) => primary === rowDepartment,
            )?.claim.id === claim.id;
      const fallbackCounterpoint =
        concerns[index % Math.max(concerns.length, 1)] ??
        (ko
          ? "현재 강점이 이어지더라도 반대 신호와 판단 변경 조건을 함께 확인해야 합니다."
          : "Even if current strengths persist, opposing signals and change conditions still require confirmation.");
      return {
        id: `A${String(index + 1).padStart(2, "0")}`,
        title:
          focusedDepartment !== undefined
            ? compactEditorialText(
                analysisItems[index] === undefined
                  ? claimText
                  : presentLocalized(analysisItems[index].title, locale),
                1,
              )
            : isPrimaryDepartmentClaim
              ? departmentThesisTitle(rowDepartment, locale)
              : compactEditorialText(claimText, 1),
        agentView:
          focusedDepartment === undefined
            ? compactEditorialText(
                (isPrimaryDepartmentClaim || index % 2 === 0
                  ? relatedTeam?.evidence
                  : relatedTeam?.strongestClaim) ??
                  presentLocalized(file.condition, locale),
                1,
              )
            : focusedDecision,
        evidence:
          focusedDepartment === undefined
            ? `${compactEditorialText(claimText, 1)}\n${claimEvidence(file, claim, locale)}`
            : focusedEvidence,
        counterpoint: compactEditorialText(
          claim.counterpoint === undefined
            ? claim.verdict === "partial"
              ? ko
                ? `근거가 이 논지를 일부만 지지합니다. ${fallbackCounterpoint}`
                : `Evidence only partially supports this thesis. ${fallbackCounterpoint}`
              : claim.verdict === "contradicted"
                ? ko
                  ? `연결 근거가 이 논지와 충돌합니다. ${fallbackCounterpoint}`
                  : `Linked evidence conflicts with this thesis. ${fallbackCounterpoint}`
                : fallbackCounterpoint
            : presentLocalized(claim.counterpoint, locale),
          1,
        ),
        checkpoint: compactEditorialText(
          claim.checkpoint === undefined
            ? presentLocalized(
                index % 2 === 0 ? file.nextEvent : file.changeCondition,
                locale,
              )
            : presentLocalized(claim.checkpoint, locale),
          1,
        ),
        evidenceId: claim.id,
        strength: claim.strength,
      };
    },
  );
  const remainingRowCount =
    file.researchTarget?.kind === "department"
      ? 0
      : Math.max(0, 4 - claimRows.length);
  const analysisRows: EditorialAnalysisRow[] = [
    ...claimRows,
    ...analysisItems.slice(0, remainingRowCount).map((item, index) => ({
      id: `A${String(claimRows.length + index + 1).padStart(2, "0")}`,
      title: compactEditorialText(presentLocalized(item.title, locale), 1),
      agentView: compactEditorialText(
        presentLocalized(item.summary, locale),
        1,
      ),
      evidence: compactEditorialText(presentLocalized(item.detail, locale), 1),
      counterpoint: compactEditorialText(
        concerns[index % Math.max(concerns.length, 1)] ??
          presentLocalized(file.condition, locale),
        1,
      ),
      checkpoint: compactEditorialText(
        presentLocalized(
          index % 2 === 0 ? file.nextEvent : file.changeCondition,
          locale,
        ),
        1,
      ),
      strength: "unverified" as const,
    })),
  ];
  const editorialInsights = buildEditorialInsights({
    file,
    locale,
    teams: teamViews,
    analysisRows,
    baseAnswer,
    valuation: presentLocalized(file.valuation, locale),
    nextVerification: presentLocalized(file.nextEvent, locale),
    changeCondition: presentLocalized(file.changeCondition, locale),
  });
  const {
    companySnapshot,
    debates,
    directAnswer,
    finalView,
    initialView,
    valuationConclusion: insightValuationConclusion,
  } = editorialInsights;
  const financialProof = dedupeEditorialTexts([
    metricProof(file, locale, [
      "revenue_growth",
      "operating_margin",
      "free_cash_flow",
    ]),
    metricProof(file, locale, ["forward_pe", "pe", "peer_premium"]),
  ])
    .filter((value) => value.length > 0)
    .join(" · ");
  const valuationConclusion =
    focusedDepartment === "financial" && financialProof.length > 0
      ? [
          financialProof,
          ko
            ? "현재 프리미엄은 성장·마진·현금 전환이 함께 유지될 때만 방어됩니다."
            : "The current premium is defensible only while growth, margins, and cash conversion hold together.",
        ].join(" ")
      : insightValuationConclusion;
  const priceProof = metricProof(file, locale, [
    "current_price",
    "relative_performance_3m",
    "relative_performance_1y",
  ]);
  const marketRequirement = metricProof(file, locale, [
    "forward_pe",
    "pe",
    "ev_ebitda",
    "peer_premium",
  ]);
  const businessProof = metricProof(file, locale, [
    "revenue_growth",
    "segment_share",
    "forward_revenue",
  ]);
  const earningsProof = metricProof(file, locale, [
    "operating_margin",
    "gross_margin",
    "free_cash_flow",
    "capital_expenditures",
  ]);
  const calloutProof = (headline: string, kind: "catalyst" | "risk") => {
    if (/(?:valuation|multiple|price|밸류|멀티플|가격)/iu.test(headline))
      return marketRequirement || priceProof;
    if (/(?:margin|cash|profit|마진|현금|이익)/iu.test(headline))
      return earningsProof;
    if (/(?:export|regulat|수출|규제)/iu.test(headline))
      return presentLocalized(file.changeCondition, locale);
    if (/(?:concentrat|risk|집중|위험)/iu.test(headline))
      return (
        riskTeam?.evidence ?? presentLocalized(file.changeCondition, locale)
      );
    if (/(?:demand|revenue|growth|수요|매출|성장)/iu.test(headline))
      return businessProof;
    if (/(?:platform|ecosystem|moat|cuda|플랫폼|생태계|해자)/iu.test(headline))
      return companyTeam?.evidence ?? businessProof;
    return kind === "catalyst"
      ? businessProof || presentLocalized(file.nextEvent, locale)
      : presentLocalized(file.changeCondition, locale);
  };
  const catalystCopy = dedupeEditorialTexts([
    ...analysisRows.map((item) => item.agentView),
    ...positives,
  ])
    .filter((value) => !lowValueEditorialCopy(value))
    .slice(0, 3);
  const riskCopy = dedupeEditorialTexts([
    ...analysisRows.map((item) => item.counterpoint),
    ...concerns,
  ])
    .filter((value) => !lowValueEditorialCopy(value))
    .slice(0, 3);
  const catalysts = distinctCallouts(
    catalystCopy,
    catalystCopy.map((headline, index) => [
      calloutProof(headline, "catalyst"),
      analysisRows[index]?.evidence ?? "",
      analysisRows[index]?.agentView ?? "",
      analysisRows[index]?.checkpoint ?? "",
    ]),
    presentLocalized(file.nextEvent, locale),
  );
  const risks = distinctCallouts(
    riskCopy,
    riskCopy.map((headline, index) => [
      calloutProof(headline, "risk"),
      analysisRows[index]?.counterpoint ?? "",
      analysisRows[index]?.checkpoint ?? "",
      analysisRows[index]?.evidence ?? "",
    ]),
    presentLocalized(file.changeCondition, locale),
  );
  const standardComparisonRows: EditorialComparisonRow[] = [
    {
      label: ko ? "가격·추세" : "Price & trend",
      companyView:
        priceProof ||
        compactEditorialText(
          marketTeam?.strongestClaim ??
            presentLocalized(file.expectation, locale),
          1,
        ),
      benchmarkLens:
        marketRequirement ||
        optionalDistinctText(
          presentLocalized(file.expectation, locale),
          marketTeam?.strongestClaim ??
            presentLocalized(file.expectation, locale),
        ),
      interpretation: comparisonInterpretation({
        teamEvidence:
          marketTeam?.evidence ?? presentLocalized(file.condition, locale),
        checkpoint: presentLocalized(file.nextEvent, locale),
      }),
    },
    {
      label: ko ? "사업 전환" : "Business conversion",
      companyView:
        businessProof ||
        compactEditorialText(
          companyTeam?.strongestClaim ?? presentLocalized(file.thesis, locale),
          1,
        ),
      benchmarkLens: optionalDistinctText(
        companyTeam?.evidence ??
          positives[0] ??
          presentLocalized(file.nextEvent, locale),
        companyTeam?.strongestClaim ?? presentLocalized(file.thesis, locale),
      ),
      interpretation: comparisonInterpretation({
        teamEvidence:
          companyTeam?.evidence ??
          presentLocalized(file.changeCondition, locale),
        checkpoint: presentLocalized(file.nextEvent, locale),
      }),
    },
    {
      label: ko ? "이익의 질" : "Earnings quality",
      companyView:
        earningsProof ||
        compactEditorialText(
          financialTeam?.strongestClaim ??
            presentLocalized(file.valuation, locale),
          1,
        ),
      benchmarkLens: optionalDistinctText(
        financialTeam?.evidence ?? presentLocalized(file.valuation, locale),
        financialTeam?.strongestClaim ??
          presentLocalized(file.valuation, locale),
      ),
      interpretation: comparisonInterpretation({
        teamEvidence:
          financialTeam?.evidence ??
          presentLocalized(file.changeCondition, locale),
        checkpoint: presentLocalized(file.changeCondition, locale),
      }),
    },
  ];
  const comparisonRows: EditorialComparisonRow[] =
    focusedDepartment === "financial"
      ? analysisRows.slice(0, 3).map((row) => ({
          label: row.title,
          companyView: row.evidence,
          benchmarkLens: row.counterpoint,
          interpretation: dedupeEditorialTexts([
            row.counterpoint,
            row.checkpoint,
          ])
            .slice(0, 2)
            .join(" "),
          ...(row.evidenceId === undefined
            ? {}
            : { evidenceId: row.evidenceId }),
        }))
      : standardComparisonRows;
  const sourceScenarios = file.scenarios
    .map((scenario) => ({
      id: scenario.id,
      label: /^(?:base|기본|기준)$/iu.test(localized(scenario.label, locale))
        ? ko
          ? "현재 근거 전망"
          : "Current evidence outlook"
        : presentLocalized(scenario.label, locale),
      thesis: presentLocalized(scenario.thesis, locale),
      assumptions: scenario.assumptions.map((assumption) =>
        assumption.kind === "metric"
          ? compactScenarioAssumption(
              `${localized(assumption.metric, locale)} ${localized(assumption.displayValue, locale)} · ${localized(assumption.basis, locale)}`,
            )
          : compactEditorialText(presentLocalized(assumption.note, locale), 1),
      ),
    }))
    .filter(
      (scenario) =>
        scenario.assumptions.length >= 2 ||
        (scenario.thesis.length >= 40 &&
          scenario.thesis.trim() !== scenario.label.trim()),
    );
  const investmentModel = file.metricSnapshot?.investmentModel;
  const modeledScenarios =
    investmentModel?.scenarios.map((scenario) => {
      const returnText =
        scenario.returnPercent === undefined
          ? undefined
          : `${scenario.returnPercent >= 0 ? "+" : ""}${scenario.returnPercent.toFixed(1)}%`;
      const impliedPrice =
        scenario.impliedPrice === undefined
          ? undefined
          : `$${scenario.impliedPrice.toLocaleString(ko ? "ko-KR" : "en-US", { maximumFractionDigits: 2 })}`;
      const requiredValue =
        scenario.requiredValue === undefined ||
        scenario.requiredUnit === undefined
          ? undefined
          : investmentModelValue(
              scenario.requiredValue,
              scenario.requiredUnit,
              locale,
            );
      return {
        id: `investment-model:${scenario.id}`,
        label: scenario.label[locale],
        thesis:
          impliedPrice === undefined
            ? scenario.requiredMetric[locale]
            : `${impliedPrice}${returnText === undefined ? "" : ` · ${returnText}`}`,
        assumptions: [
          requiredValue === undefined
            ? scenario.requiredMetric[locale]
            : `${scenario.requiredMetric[locale]} ${requiredValue}`,
          ...scenario.assumptions.map((assumption) => assumption[locale]),
        ].filter((value, index, values) => values.indexOf(value) === index),
      };
    }) ?? [];
  const scenarios =
    modeledScenarios.length > 0
      ? modeledScenarios
      : sourceScenarios.length > 0
        ? sourceScenarios
        : [
            {
              id: "recovery-path",
              label: ko ? "반등 확인 조건" : "Rebound confirmation",
              thesis:
                companyTeam?.strongestClaim ??
                positives[0] ??
                presentLocalized(file.nextEvent, locale),
              assumptions: [
                positives[0],
                presentLocalized(file.nextEvent, locale),
              ].filter((value): value is string => value !== undefined),
            },
            {
              id: "current-view",
              label: ko ? "현재 판단 유지" : "Current view holds",
              thesis: directAnswer,
              assumptions: [
                marketTeam?.evidence,
                financialTeam?.evidence,
              ].filter((value): value is string => value !== undefined),
            },
            {
              id: "downside-path",
              label: ko ? "하방 확대 조건" : "Downside expansion",
              thesis:
                riskTeam?.strongestClaim ??
                concerns[0] ??
                presentLocalized(file.changeCondition, locale),
              assumptions: [
                concerns[0],
                presentLocalized(file.changeCondition, locale),
              ].filter((value): value is string => value !== undefined),
            },
          ];
  const teamRows: readonly EditorialTeamRow[] = teamViews;
  const resultIndex = conclusionIndex(file);
  const evidenceReliability = reliability(file);
  const teamAgreement = Math.round(
    (file.teamViews.filter(
      (team) =>
        team.vote === "support" || team.vote === "support_with_reservations",
    ).length /
      Math.max(file.teamViews.length, 1)) *
      100,
  );
  const evidenceIndex = file.evidenceIndex.map((source) => ({
    ...source,
    ...readerEvidenceLabel(source.publisher, source.title, locale),
  }));
  const groupedMetrics = metricGroups(file, locale);
  const committeeMetricIds = [
    "current_price",
    "revenue_growth",
    "operating_margin",
    "free_cash_flow",
    "forward_pe",
    "pe",
  ];
  const allVisualMetrics = Object.values(groupedMetrics).flat();
  const visualMetrics =
    focusedDepartment === undefined
      ? committeeMetricIds.flatMap((id) => {
          const metric = allVisualMetrics.find(
            (candidate) =>
              candidate.id === id || candidate.id.startsWith(`${id}:`),
          );
          return metric === undefined ? [] : [metric];
        })
      : groupedMetrics[focusedDepartment];
  const claimBalance = evidenceBalance(file, locale);
  const decisionPaths: readonly EditorialDecisionPath[] = [
    {
      id: "confirm",
      label: ko ? "상방 확인" : "Confirmation",
      headline:
        catalysts[0]?.headline ??
        positives[0] ??
        presentLocalized(file.nextEvent, locale),
      detail: catalysts[0]?.body ?? presentLocalized(file.nextEvent, locale),
    },
    {
      id: "hold",
      label: ko ? "현재 판단" : "Current view",
      headline: directAnswer,
      detail: presentLocalized(file.nextEvent, locale),
    },
    {
      id: "invalidate",
      label: ko ? "판단 무효화" : "Invalidation",
      headline:
        risks[0]?.headline ??
        concerns[0] ??
        presentLocalized(file.changeCondition, locale),
      detail: presentLocalized(file.changeCondition, locale),
    },
  ];
  const valuationFramework =
    investmentModel === undefined
      ? undefined
      : valuationFrameworkFor(investmentModel, locale);
  return {
    question,
    directAnswer,
    investmentView: [directAnswer],
    posture,
    conclusionIndex: resultIndex,
    conclusionLabel:
      resultIndex >= 70
        ? ko
          ? "긍정 논지 우세"
          : "Constructive case leads"
        : resultIndex >= 45
          ? ko
            ? "근거 혼재"
            : "Evidence is mixed"
          : ko
            ? "하방 논지 우세"
            : "Downside case leads",
    evidenceReliability,
    headlineMetrics: [
      {
        label: ko ? "현재가" : "Observed price",
        value:
          file.marketSnapshot === undefined
            ? "—"
            : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`,
      },
      {
        label: ko ? "팀 동의" : "Team agreement",
        value: `${teamAgreement}%`,
      },
      {
        label: ko ? "근거 신뢰도" : "Evidence reliability",
        value: `${evidenceReliability}%`,
      },
      {
        label: ko ? "반론 검증" : "Rebuttal resolution",
        value: `${file.qualityScorecard?.rebuttalResolution ?? evidenceReliability}%`,
      },
    ],
    companySnapshot,
    lensRows:
      focusedDepartment === "company"
        ? [
            {
              label: ko ? "핵심 성장 엔진" : "Primary growth engine",
              content:
                analysisRows[0]?.evidence ??
                compactEditorialText(baseAnswer, 1),
            },
            {
              label: ko ? "경쟁우위의 근거" : "Moat evidence",
              content:
                analysisRows[1]?.evidence ??
                analysisRows[0]?.agentView ??
                compactEditorialText(baseAnswer, 1),
            },
            {
              label: ko ? "경쟁우위 훼손 경로" : "Moat erosion path",
              content:
                analysisRows[0]?.counterpoint ??
                compactEditorialText(
                  presentLocalized(file.changeCondition, locale),
                  1,
                ),
            },
            {
              label: ko ? "다음 실행 증거" : "Next execution proof",
              content:
                analysisRows[0]?.checkpoint ??
                compactEditorialText(
                  presentLocalized(file.nextEvent, locale),
                  1,
                ),
            },
          ]
        : [
            {
              label: ko ? "시장의 기본 기대" : "Market baseline",
              content: compactEditorialText(
                combineDistinct(
                  marketTeam?.strongestClaim ??
                    presentLocalized(file.expectation, locale),
                  presentLocalized(file.expectation, locale),
                ),
                2,
              ),
            },
            {
              label: ko ? "가격에 반영된 기대" : "Embedded expectations",
              content: compactEditorialText(
                combineDistinct(
                  presentLocalized(file.valuation, locale),
                  financialTeam?.strongestClaim ??
                    presentLocalized(file.condition, locale),
                ),
                2,
              ),
            },
            {
              label: ko ? "에이전트 팀의 관점" : "Agent team view",
              content: directAnswer,
            },
            {
              label: ko ? "판단이 갈리는 지점" : "Point of disagreement",
              content: compactEditorialText(
                concerns[0] ??
                  (ko
                    ? "중요한 반대 근거가 확인되지 않았습니다."
                    : "No material counter-evidence was identified."),
                1,
              ),
            },
            {
              label: ko ? "우리 판단이 틀릴 조건" : "What would prove us wrong",
              content: compactEditorialText(
                presentLocalized(file.changeCondition, locale),
                1,
              ),
            },
          ],
    catalysts,
    risks,
    coverage: file.coverage,
    analysisRows,
    valuationConclusion: compactEditorialText(valuationConclusion, 3),
    nextVerificationEvent: compactEditorialText(
      presentLocalized(file.nextEvent, locale),
      1,
    ),
    comparisonRows,
    ...(file.metricSnapshot?.comparatorQualification === undefined
      ? {}
      : {
          comparatorQualification: file.metricSnapshot.comparatorQualification,
        }),
    scenarios,
    teamRows,
    debates,
    initialView,
    finalView,
    acceptedClaims: positives,
    preservedDissent: concerns,
    evidenceIndex,
    sourceGroups: sourceGroups(file, evidenceIndex, locale),
    visualMetrics,
    metricGroups: groupedMetrics,
    evidenceBalance: claimBalance,
    decisionPaths,
    ...(valuationFramework === undefined ? {} : { valuationFramework }),
  };
}

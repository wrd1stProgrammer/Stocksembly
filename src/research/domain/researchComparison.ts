import { z } from "zod";
import type { ResearchReport } from "./report";

const LocalizedSchema = z.object({ en: z.string(), ko: z.string() }).strict();

export const ResearchComparisonSchema = z
  .object({
    baselineReportId: z.string().uuid(),
    currentReportId: z.string().uuid(),
    baselinePublishedAt: z.string().datetime(),
    currentPublishedAt: z.string().datetime(),
    conclusion: z
      .object({
        previous: LocalizedSchema,
        current: LocalizedSchema,
        direction: z.enum(["strengthened", "weakened", "changed", "unchanged"]),
      })
      .strict(),
    materialChanges: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.enum([
              "added",
              "removed",
              "strengthened",
              "weakened",
              "updated",
            ]),
            title: LocalizedSchema,
            detail: LocalizedSchema,
            sourceIds: z.array(z.string().uuid()),
          })
          .strict(),
      )
      .max(3),
    metrics: z
      .array(
        z
          .object({
            id: z.enum(["sources", "material_claims", "evidence_confidence"]),
            previous: z.number().nonnegative(),
            current: z.number().nonnegative(),
            delta: z.number(),
            unit: z.enum(["count", "percent"]),
          })
          .strict(),
      )
      .length(3),
    dataChanges: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: LocalizedSchema,
            category: z.enum([
              "market",
              "company",
              "financial",
              "risk",
              "expectations",
            ]),
            previous: z.number().finite(),
            current: z.number().finite(),
            delta: z.number().finite(),
            deltaPercent: z.number().finite().nullable(),
            unit: z.enum([
              "USD",
              "USD_per_share",
              "percent",
              "multiple",
              "count",
              "shares",
            ]),
            direction: z.enum(["improved", "deteriorated", "changed"]),
            impact: LocalizedSchema,
          })
          .strict(),
      )
      .max(8)
      .default([]),
    nextCondition: LocalizedSchema,
    noMaterialChange: z.boolean(),
  })
  .strict();

export type ResearchComparison = z.infer<typeof ResearchComparisonSchema>;
type MaterialChange = ResearchComparison["materialChanges"][number];

function section(report: ResearchReport, id: string) {
  const en =
    report.locales.en.sections.find((item) => item.id === id) ??
    report.locales.en.sections[0];
  const ko =
    report.locales.ko.sections.find((item) => item.id === id) ??
    report.locales.ko.sections[0];
  return {
    en: en?.body ?? "No conclusion was recorded.",
    ko: ko?.body ?? "기록된 결론이 없습니다.",
  };
}

function tokens(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1),
  );
}

function similarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  return (
    [...leftTokens].filter((token) => rightTokens.has(token)).length /
    union.size
  );
}

function confidence(report: ResearchReport): number {
  const denominator = report.metrics.reduce(
    (total, metric) => total + metric.denominator,
    0,
  );
  const passed = report.metrics.reduce(
    (total, metric) => total + metric.passed,
    0,
  );
  return denominator === 0 ? 0 : Math.round((passed / denominator) * 100);
}

function postureWeight(report: ResearchReport): number {
  return report.claims.reduce((score, claim) => {
    const weight = claim.materiality === "material" ? 2 : 1;
    if (claim.semanticVerdict === "entailed") return score + weight;
    if (claim.semanticVerdict === "contradicted") return score - weight;
    return score;
  }, 0);
}

function dataChanges(
  previous: ResearchReport,
  current: ResearchReport,
): ResearchComparison["dataChanges"] {
  const prior = new Map(
    previous.metricSnapshot?.metrics.map((metric) => [metric.id, metric]) ?? [],
  );
  const priority = new Map(
    [
      "forward_revenue",
      "forward_eps",
      "revenue_growth",
      "gross_margin",
      "operating_margin",
      "free_cash_flow",
      "net_debt",
      "current_price",
      "forward_pe",
      "price_target_median",
      "relative_performance_3m",
    ].map((id, index) => [id, index]),
  );
  return (current.metricSnapshot?.metrics ?? [])
    .flatMap<ResearchComparison["dataChanges"][number]>((metric) => {
      const before = prior.get(metric.id);
      if (before === undefined || before.unit !== metric.unit) return [];
      const delta = metric.value - before.value;
      const deltaPercent =
        before.value === 0 ? null : (delta / Math.abs(before.value)) * 100;
      const material =
        metric.unit === "percent"
          ? Math.abs(delta) >= 0.25
          : deltaPercent === null
            ? Math.abs(delta) > 0
            : Math.abs(deltaPercent) >= 0.5;
      if (!material) return [];
      const direction =
        metric.signal === "contextual"
          ? ("changed" as const)
          : delta > 0 === (metric.signal === "higher_better")
            ? ("improved" as const)
            : ("deteriorated" as const);
      const directionEn =
        direction === "improved"
          ? "strengthens"
          : direction === "deteriorated"
            ? "weakens"
            : "changes";
      const directionKo =
        direction === "improved"
          ? "강화합니다"
          : direction === "deteriorated"
            ? "약화합니다"
            : "바꿉니다";
      return [
        {
          id: metric.id,
          label: metric.label,
          category: metric.category,
          previous: before.value,
          current: metric.value,
          delta,
          deltaPercent,
          unit: metric.unit,
          direction,
          impact: {
            en: `The change in ${metric.label.en.toLowerCase()} ${directionEn} this part of the investment case.`,
            ko: `${metric.label.ko} 변화가 이 투자 논지의 근거를 ${directionKo}.`,
          },
        },
      ];
    })
    .sort((left, right) => {
      const leftPriority = priority.get(left.id) ?? 100;
      const rightPriority = priority.get(right.id) ?? 100;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return (
        Math.abs(right.deltaPercent ?? right.delta) -
        Math.abs(left.deltaPercent ?? left.delta)
      );
    })
    .slice(0, 8);
}

export function buildResearchComparison(input: {
  readonly current: ResearchReport;
  readonly previous: ResearchReport;
  readonly currentPublishedAt: string;
  readonly previousPublishedAt: string;
}): ResearchComparison {
  const { current, previous } = input;
  const previousClaims = previous.claims.filter(
    (claim) => claim.materiality === "material" && claim.text !== undefined,
  );
  const currentClaims = current.claims.filter(
    (claim) => claim.materiality === "material" && claim.text !== undefined,
  );
  const matches = currentClaims.map((claim) => {
    const candidates = previousClaims
      .map((candidate) => ({
        candidate,
        score: similarity(
          claim.text?.en ?? claim.claimId,
          candidate.text?.en ?? candidate.claimId,
        ),
      }))
      .sort((left, right) => right.score - left.score);
    return { claim, match: candidates[0] };
  });
  const usedPrevious = new Set(
    matches
      .filter((entry) => (entry.match?.score ?? 0) >= 0.38)
      .map((entry) => entry.match?.candidate.claimId),
  );
  const materialChanges: MaterialChange[] = [
    ...matches.flatMap<MaterialChange>((entry): MaterialChange[] => {
      const match = entry.match;
      if (match === undefined || match.score < 0.38)
        return [
          {
            id: `added:${entry.claim.claimId}`,
            kind: "added" as const,
            title: {
              en: "New material finding",
              ko: "새로 확인된 핵심 판단",
            },
            detail: entry.claim.text ?? {
              en: "A new material claim was added.",
              ko: "새 핵심 주장이 추가됐습니다.",
            },
            sourceIds: entry.claim.sourceIds,
          },
        ];
      const sourceDelta =
        entry.claim.sourceIds.length - match.candidate.sourceIds.length;
      const verdictChanged =
        entry.claim.semanticVerdict !== match.candidate.semanticVerdict;
      if (!verdictChanged && sourceDelta === 0) return [];
      const stronger =
        entry.claim.semanticVerdict === "entailed" &&
        (match.candidate.semanticVerdict !== "entailed" || sourceDelta > 0);
      const weaker =
        entry.claim.semanticVerdict !== "entailed" &&
        match.candidate.semanticVerdict === "entailed";
      return [
        {
          id: `updated:${entry.claim.claimId}`,
          kind: stronger
            ? ("strengthened" as const)
            : weaker
              ? ("weakened" as const)
              : ("updated" as const),
          title: stronger
            ? { en: "Evidence strengthened", ko: "근거가 강화된 판단" }
            : weaker
              ? { en: "Evidence weakened", ko: "근거가 약해진 판단" }
              : { en: "Finding updated", ko: "내용이 바뀐 판단" },
          detail: entry.claim.text ?? {
            en: "The evidence posture changed.",
            ko: "근거 상태가 달라졌습니다.",
          },
          sourceIds: entry.claim.sourceIds,
        },
      ];
    }),
    ...previousClaims
      .filter((claim) => !usedPrevious.has(claim.claimId))
      .map((claim) => ({
        id: `removed:${claim.claimId}`,
        kind: "removed" as const,
        title: {
          en: "Prior thesis no longer retained",
          ko: "더는 채택하지 않은 기존 판단",
        },
        detail: claim.text ?? {
          en: "A prior material claim was removed.",
          ko: "기존 핵심 주장이 제외됐습니다.",
        },
        sourceIds: claim.sourceIds,
      })),
  ].slice(0, 3);
  const previousWeight = postureWeight(previous);
  const currentWeight = postureWeight(current);
  const numericChanges = dataChanges(previous, current);
  const conclusionSimilarity = similarity(
    section(previous, "ten_second_brief").en,
    section(current, "ten_second_brief").en,
  );
  const direction =
    materialChanges.length === 0 &&
    numericChanges.length === 0 &&
    conclusionSimilarity >= 0.72
      ? ("unchanged" as const)
      : currentWeight > previousWeight
        ? ("strengthened" as const)
        : currentWeight < previousWeight
          ? ("weakened" as const)
          : ("changed" as const);
  const metric = (
    id: "sources" | "material_claims" | "evidence_confidence",
    before: number,
    after: number,
    unit: "count" | "percent",
  ) => ({ id, previous: before, current: after, delta: after - before, unit });
  return ResearchComparisonSchema.parse({
    baselineReportId: previous.reportId,
    currentReportId: current.reportId,
    baselinePublishedAt: input.previousPublishedAt,
    currentPublishedAt: input.currentPublishedAt,
    conclusion: {
      previous: section(previous, "ten_second_brief"),
      current: section(current, "ten_second_brief"),
      direction,
    },
    materialChanges,
    metrics: [
      metric(
        "sources",
        previous.sources.length,
        current.sources.length,
        "count",
      ),
      metric(
        "material_claims",
        previousClaims.length,
        currentClaims.length,
        "count",
      ),
      metric(
        "evidence_confidence",
        confidence(previous),
        confidence(current),
        "percent",
      ),
    ],
    dataChanges: numericChanges,
    nextCondition: section(current, "change_conditions"),
    noMaterialChange:
      materialChanges.length === 0 &&
      numericChanges.length === 0 &&
      direction === "unchanged",
  });
}

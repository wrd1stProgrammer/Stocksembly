import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchMetricPoint } from "../../../research/domain/metricSnapshot";
import { workflowRoleById } from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

const PERIOD_LABELS = {
  relative_performance_1m: "1M",
  relative_performance_3m: "3M",
  relative_performance_6m: "6M",
  relative_performance_1y: "1Y",
} as const;

type MarketClaim = {
  readonly id: string;
  readonly dimension: string;
  readonly thesis: string;
  readonly falsifier: string;
  readonly contribution: "supports" | "opposes" | "uncertain" | "neutral";
  readonly evidenceIds: readonly string[];
};

export type MarketMetric = ResearchMetricPoint & {
  readonly period: string;
};

function normalizeMetric(
  metric: ResearchMetricPoint,
): MarketMetric | undefined {
  if (
    metric.id.trim().length === 0 ||
    !Number.isFinite(metric.value) ||
    metric.source.trim().length === 0
  )
    return undefined;
  return {
    ...metric,
    period: metric.period?.trim() || metric.observedAt.slice(0, 10),
  };
}

function ownedClaims(
  file: ResearchFileData,
  model: ResearchFileEditorialModel,
  locale: Locale,
): readonly MarketClaim[] {
  if (file.presentationVersion === "workflow-v2")
    return (model.structuredClaims ?? []).flatMap((claim) =>
      workflowRoleById(claim.roleOwner)?.departmentId !== "market"
        ? []
        : [
            {
              id: claim.claimId,
              dimension: claim.decisionDimension,
              thesis: claim.publicThesis[locale],
              falsifier: claim.falsifier[locale],
              contribution: claim.stanceContribution,
              evidenceIds: claim.evidenceArtifactIds,
            },
          ],
    );
  const legacyDimensions = ["regime", "catalyst", "relative_performance"];
  return model.analysisRows.map((row, index) => ({
    id: row.id,
    dimension: legacyDimensions[index] ?? row.title,
    thesis: row.evidence,
    falsifier: row.checkpoint,
    contribution: "neutral" as const,
    evidenceIds: row.evidenceId === undefined ? [] : [row.evidenceId],
  }));
}

function datedCatalysts(claims: readonly MarketClaim[]) {
  return claims.flatMap((claim) => {
    if (claim.dimension !== "catalyst") return [];
    const date = `${claim.thesis} ${claim.falsifier}`.match(
      /\b(20\d{2}-\d{2}-\d{2})\b/u,
    )?.[1];
    const sourceId = claim.evidenceIds[0];
    return date === undefined || sourceId === undefined
      ? []
      : [{ ...claim, date, sourceId }];
  });
}

function legacyDatedCatalyst(file: ResearchFileData, locale: Locale) {
  const thesis = file.nextEvent[locale];
  const date = thesis.match(/\b(20\d{2}-\d{2}-\d{2})\b/u)?.[1];
  return date === undefined
    ? []
    : [
        {
          id: "legacy-next-event",
          dimension: "catalyst",
          thesis,
          falsifier: "",
          contribution: "neutral" as const,
          evidenceIds: [] as readonly string[],
          date,
          sourceId: file.evidenceIndex[0]?.id,
        },
      ];
}

export function buildMarketReportProduct(
  file: ResearchFileData,
  model: ResearchFileEditorialModel,
  locale: Locale,
) {
  const metrics = (file.metricSnapshot?.metrics ?? []).flatMap((item) => {
    const metric = normalizeMetric(item);
    return metric === undefined ? [] : [metric];
  });
  const metric = (id: string) => metrics.find((item) => item.id === id);
  const relative = Object.entries(PERIOD_LABELS).flatMap(([id, label]) => {
    const point = metric(id);
    return point === undefined ? [] : [{ point, label }];
  });
  const qualification = file.metricSnapshot?.comparatorQualification;
  const benchmarkRows =
    qualification?.status === "qualified"
      ? qualification.rows.filter(
          (row) => row.displayEligibility && row.role !== "valuation_proxy",
        )
      : [];
  const benchmark = benchmarkRows.flatMap((row) => {
    const byKey = new Map(
      row.normalizedMetrics.map((item) => [item.key, item]),
    );
    const points = relative.flatMap(({ point, label }) => {
      const peer = byKey.get(point.id);
      return peer === undefined || peer.period !== point.period
        ? []
        : [{ label, subject: point, peer }];
    });
    return points.length < 2 ? [] : [{ row, points }];
  })[0];
  const priceLevels = metrics.filter(
    (item) =>
      item.id === "support_price" ||
      item.id.startsWith("support_price:") ||
      item.id === "resistance_price" ||
      item.id.startsWith("resistance_price:"),
  );
  const volume = metrics.find(
    (item) => item.id === "volume" || item.id === "average_volume_20d",
  );
  const ladder =
    priceLevels.length >= 2 && volume !== undefined
      ? { levels: priceLevels.sort((a, b) => b.value - a.value), volume }
      : undefined;
  const claims = ownedClaims(file, model, locale);
  const snapshot = [
    "current_price",
    "daily_change_percent",
    "relative_performance_3m",
    "relative_performance_1y",
    "pe",
    "ev_ebitda",
  ].flatMap((id) => {
    const point = metric(id);
    return point === undefined ? [] : [point];
  });
  return {
    claims,
    snapshot,
    regimeClaims: claims.filter((claim) =>
      ["regime", "timing", "relative_performance"].includes(claim.dimension),
    ),
    relativePerformance:
      relative.length >= 2 && benchmark !== undefined
        ? { benchmark, source: qualification?.rawPeerArtifactId }
        : undefined,
    ladder,
    persistence: relative.length >= 2 ? relative : undefined,
    catalysts:
      file.presentationVersion === "workflow-v2"
        ? datedCatalysts(claims)
        : legacyDatedCatalyst(file, locale),
    catalystWatch: claims.filter((claim) => claim.dimension === "catalyst"),
  };
}

export function formatMarketMetric(metric: MarketMetric, locale: Locale) {
  const formatted = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(metric.value);
  if (metric.unit === "percent") return `${formatted}%`;
  if (metric.unit === "multiple") return `${formatted}x`;
  if (metric.unit === "USD_per_share") return `$${formatted}`;
  return formatted;
}

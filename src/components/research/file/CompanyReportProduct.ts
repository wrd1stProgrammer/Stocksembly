import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchMetricPoint } from "../../../research/domain/metricSnapshot";
import { workflowRoleById } from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

export type CompanyMetric = ResearchMetricPoint & { readonly period: string };

function normalizeMetric(metric: ResearchMetricPoint): CompanyMetric | undefined {
  if (metric.id.trim().length === 0 || !Number.isFinite(metric.value))
    return undefined;
  return {
    ...metric,
    period: metric.period?.trim() || metric.observedAt.slice(0, 10),
  };
}

function companyClaims(
  file: ResearchFileData,
  model: ResearchFileEditorialModel,
  locale: Locale,
) {
  if (file.presentationVersion === "workflow-v2")
    return (model.structuredClaims ?? []).flatMap((claim) =>
      workflowRoleById(claim.roleOwner)?.departmentId !== "company"
        ? []
        : [
            {
              id: claim.claimId,
              dimension: claim.decisionDimension,
              thesis: claim.publicThesis[locale],
              falsifier: claim.falsifier[locale],
              metricIds: claim.decisiveMetricIds,
              evidenceIds: claim.evidenceArtifactIds,
            },
          ],
    );
  const legacyDimensions = ["growth_engine", "adoption", "moat"];
  return model.analysisRows.map((row, index) => ({
    id: row.id,
    dimension: legacyDimensions[index] ?? row.title,
    thesis: row.agentView,
    falsifier: row.checkpoint,
    metricIds:
      index === 1
        ? (["revenue_growth", "segment_share:data_center"] as const)
        : ([] as readonly string[]),
    evidenceIds: row.evidenceId === undefined ? [] : [row.evidenceId],
  }));
}

export function buildCompanyReportProduct(
  file: ResearchFileData,
  model: ResearchFileEditorialModel,
  locale: Locale,
) {
  const metrics = (file.metricSnapshot?.metrics ?? []).flatMap((item) => {
    const metric = normalizeMetric(item);
    return metric === undefined ? [] : [metric];
  });
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const segments = metrics.filter((metric) =>
    metric.id.startsWith("segment_share:"),
  );
  const claims = companyClaims(file, model, locale);
  const qualification = file.metricSnapshot?.comparatorQualification;
  const comparatorRows =
    qualification?.status !== "qualified"
      ? []
      : qualification.rows.flatMap((row) => {
          if (!row.displayEligibility) return [];
          const comparableMetrics = row.normalizedMetrics.filter((metric) =>
            [
              "revenue_growth",
              "gross_margin",
              "operating_margin",
              "forward_pe",
              "price_earnings_ttm",
              "enterprise_value_ebitda_ttm",
              "enterprise_value_to_revenue_ttm",
            ].includes(metric.key),
          );
          const keys = new Set(comparableMetrics.map((metric) => metric.key));
          const hasGrowth = keys.has("revenue_growth");
          const hasMargin =
            keys.has("gross_margin") || keys.has("operating_margin");
          const hasValuation = [...keys].some((key) =>
            [
              "forward_pe",
              "price_earnings_ttm",
              "enterprise_value_ebitda_ttm",
              "enterprise_value_to_revenue_ttm",
            ].includes(key),
          );
          return !hasGrowth || (!hasMargin && !hasValuation)
            ? []
            : [{ ...row, normalizedMetrics: comparableMetrics }];
        });
  const proof = claims
    .filter((claim) => claim.dimension === "adoption")
    .map((claim) => ({
      ...claim,
      metrics: claim.metricIds.flatMap((id) => {
        const metric = byId.get(id);
        return metric === undefined ? [] : [metric];
      }),
    }));
  return {
    claims,
    operatingSnapshot: [
      "revenue_growth",
      "gross_margin",
      "operating_margin",
      "roic",
      "pe",
      "forward_pe",
    ].flatMap((id) => {
      const metric = byId.get(id);
      return metric === undefined ? [] : [metric];
    }),
    segments: segments.length >= 2 ? segments : undefined,
    adoptionProof: proof.filter((claim) => claim.metrics.length > 0),
    growthEngines: claims.filter((claim) => claim.dimension === "growth_engine"),
    adoptionClaims: claims.filter((claim) => claim.dimension === "adoption"),
    moatLayers: claims.filter((claim) => claim.dimension === "moat"),
    comparatorRows,
    milestones: claims.filter((claim) =>
      ["growth_engine", "adoption"].includes(claim.dimension),
    ),
    erosion: claims.filter(
      (claim) => claim.dimension === "competitive_erosion",
    ),
  };
}

export function formatCompanyMetric(metric: CompanyMetric, locale: Locale) {
  const formatted = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(metric.value);
  if (metric.unit === "percent") return `${formatted}%`;
  if (metric.unit === "multiple") return `${formatted}x`;
  if (metric.unit === "USD_per_share") return `$${formatted}`;
  return formatted;
}

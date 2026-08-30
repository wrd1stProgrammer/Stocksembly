import type Database from "better-sqlite3";
import { z } from "zod";
import { canonicalJson } from "../../../domain/contractHelpers";

export const RESEARCH_QUALITY_OUTCOMES = [
  "complete",
  "item_omitted",
  "quality_degraded",
  "run_failed",
] as const;

const ScoreDimensionsSchema = z
  .object({
    decisionUsefulness: z.number().min(0).max(2).nullable(),
    evidenceTraceability: z.number().min(0).max(2).nullable(),
    comparatorValuationDiscipline: z.number().min(0).max(2).nullable(),
    editorialClarity: z.number().min(0).max(2).nullable(),
    reliability: z.number().min(0).max(2).nullable(),
  })
  .strict()
  .readonly();

export const ResearchQualityMetricsSchema = z
  .object({
    omittedClaims: z.number().int().nonnegative(),
    omittedSources: z.number().int().nonnegative(),
    omittedPeers: z.number().int().nonnegative(),
    omittedScenarios: z.number().int().nonnegative(),
    repairAttempts: z.number().int().nonnegative(),
    groundedClaimRatio: z.number().min(0).max(1).nullable(),
    scoreDimensions: ScoreDimensionsSchema,
    latencyMs: z.number().int().nonnegative().nullable(),
    modelCostUsd: z.number().nonnegative().nullable(),
    dataCostUsd: z.number().nonnegative().nullable(),
  })
  .strict()
  .readonly();

export type ResearchQualityMetrics = z.infer<
  typeof ResearchQualityMetricsSchema
>;
export type ResearchQualityOutcome = (typeof RESEARCH_QUALITY_OUTCOMES)[number];

const ObservationRowSchema = z.object({
  run_id: z.string().uuid(),
  workflow_version: z.string().min(1),
  report_version: z.string().min(1),
  outcome: z.enum(RESEARCH_QUALITY_OUTCOMES),
  observed_at: z.string().datetime(),
  metrics_json: z.string(),
  reason_codes_json: z.string(),
});

export type ResearchQualityObservation = Readonly<{
  runId: string;
  workflowVersion: string;
  reportVersion: string;
  outcome: ResearchQualityOutcome;
  observedAt: string;
  metrics: ResearchQualityMetrics;
  reasonCodes: readonly string[];
}>;

export const EMPTY_RESEARCH_QUALITY_METRICS = {
  omittedClaims: 0,
  omittedSources: 0,
  omittedPeers: 0,
  omittedScenarios: 0,
  repairAttempts: 0,
  groundedClaimRatio: null,
  scoreDimensions: {
    decisionUsefulness: null,
    evidenceTraceability: null,
    comparatorValuationDiscipline: null,
    editorialClarity: null,
    reliability: null,
  },
  latencyMs: null,
  modelCostUsd: null,
  dataCostUsd: null,
} as const satisfies ResearchQualityMetrics;

const OUTCOME_PRIORITY: Readonly<Record<ResearchQualityOutcome, number>> = {
  complete: 0,
  item_omitted: 1,
  quality_degraded: 2,
  run_failed: 3,
};

const RecoveryMetadataSchema = z
  .object({
    omissions: z
      .array(z.object({ reason: z.string().min(1) }).passthrough())
      .default([]),
    repairAttempts: z.array(z.unknown()).default([]),
    scenarioRepairAttempts: z.array(z.unknown()).default([]),
    comparatorNormalizationAttemptCount: z
      .number()
      .int()
      .nonnegative()
      .default(0),
  })
  .passthrough();

export function qualityMetricsForPublication(input: {
  readonly claims: readonly { readonly semanticVerdict?: string }[];
  readonly recoveryMetadata: unknown;
  readonly createdAt: string;
  readonly publishedAt: string;
}): ResearchQualityMetrics {
  const recovery = RecoveryMetadataSchema.parse(input.recoveryMetadata ?? {});
  const reasons = recovery.omissions.map((omission) => omission.reason);
  const grounded = input.claims.filter(
    (claim) => claim.semanticVerdict === "entailed",
  ).length;
  const latencyMs = Date.parse(input.publishedAt) - Date.parse(input.createdAt);
  return ResearchQualityMetricsSchema.parse({
    ...EMPTY_RESEARCH_QUALITY_METRICS,
    omittedClaims: reasons.filter(
      (reason) => !/(?:source|peer|comparator|scenario)/u.test(reason),
    ).length,
    omittedSources: reasons.filter((reason) => /source/u.test(reason)).length,
    omittedPeers: reasons.filter((reason) =>
      /(?:peer|comparator)/u.test(reason),
    ).length,
    omittedScenarios: reasons.filter((reason) => /scenario/u.test(reason))
      .length,
    repairAttempts:
      recovery.repairAttempts.length +
      recovery.scenarioRepairAttempts.length +
      recovery.comparatorNormalizationAttemptCount,
    groundedClaimRatio:
      input.claims.length === 0 ? null : grounded / input.claims.length,
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : null,
  });
}

function stableReasonCodes(reasonCodes: readonly string[]): readonly string[] {
  return [
    ...new Set(reasonCodes.map((reason) => reason.trim()).filter(Boolean)),
  ]
    .sort()
    .slice(0, 256);
}

export function readResearchQualityObservation(
  database: Database.Database,
  runId: string,
): ResearchQualityObservation | undefined {
  const parsed = ObservationRowSchema.safeParse(
    database
      .prepare("SELECT * FROM research_quality_observations WHERE run_id = ?")
      .get(runId),
  );
  if (!parsed.success) return undefined;
  const metrics = ResearchQualityMetricsSchema.parse(
    JSON.parse(parsed.data.metrics_json),
  );
  const reasons = z
    .array(z.string().min(1))
    .readonly()
    .parse(JSON.parse(parsed.data.reason_codes_json));
  return {
    runId: parsed.data.run_id,
    workflowVersion: parsed.data.workflow_version,
    reportVersion: parsed.data.report_version,
    outcome: parsed.data.outcome,
    observedAt: parsed.data.observed_at,
    metrics,
    reasonCodes: reasons,
  };
}

export function persistResearchQualityObservation(
  database: Database.Database,
  observation: ResearchQualityObservation,
): void {
  const current = readResearchQualityObservation(database, observation.runId);
  const outcome =
    current !== undefined &&
    OUTCOME_PRIORITY[current.outcome] > OUTCOME_PRIORITY[observation.outcome]
      ? current.outcome
      : observation.outcome;
  const reasonCodes = stableReasonCodes([
    ...(current?.reasonCodes ?? []),
    ...observation.reasonCodes,
  ]);
  const incoming = ResearchQualityMetricsSchema.parse(observation.metrics);
  const metrics =
    current === undefined
      ? incoming
      : ResearchQualityMetricsSchema.parse({
          ...incoming,
          omittedClaims: Math.max(
            current.metrics.omittedClaims,
            incoming.omittedClaims,
          ),
          omittedSources: Math.max(
            current.metrics.omittedSources,
            incoming.omittedSources,
          ),
          omittedPeers: Math.max(
            current.metrics.omittedPeers,
            incoming.omittedPeers,
          ),
          omittedScenarios: Math.max(
            current.metrics.omittedScenarios,
            incoming.omittedScenarios,
          ),
          repairAttempts: Math.max(
            current.metrics.repairAttempts,
            incoming.repairAttempts,
          ),
          groundedClaimRatio:
            incoming.groundedClaimRatio ?? current.metrics.groundedClaimRatio,
          latencyMs: incoming.latencyMs ?? current.metrics.latencyMs,
          modelCostUsd: incoming.modelCostUsd ?? current.metrics.modelCostUsd,
          dataCostUsd: incoming.dataCostUsd ?? current.metrics.dataCostUsd,
        });
  database
    .prepare(`INSERT INTO research_quality_observations(
      run_id, workflow_version, report_version, outcome, observed_at,
      metrics_json, reason_codes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      workflow_version = excluded.workflow_version,
      report_version = excluded.report_version,
      outcome = excluded.outcome,
      observed_at = excluded.observed_at,
      metrics_json = excluded.metrics_json,
      reason_codes_json = excluded.reason_codes_json`)
    .run(
      observation.runId,
      observation.workflowVersion,
      observation.reportVersion,
      outcome,
      observation.observedAt,
      canonicalJson(metrics),
      canonicalJson(reasonCodes),
    );
}

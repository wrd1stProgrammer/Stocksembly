import { z } from "zod";

export const QUALITY_FATAL_REASONS = [
  "issuer_identity_mismatch", "metric_value_mismatch", "metric_period_mismatch",
  "metric_unit_mismatch", "source_purpose_mismatch", "unqualified_numeric_peer",
  "scenario_direction_invalid", "non_assessable_core_claim", "repeated_default_wait_posture",
  "direct_order_imperative", "raw_public_precision", "decisive_fact_not_entailed",
  "derived_input_ineligible", "exact_source_link_missing", "issuer_identity_unresolved",
  "no_grounded_core_answer", "whole_envelope_integrity_failure",
] as const;

const RuntimeDispositionSchema = z.enum([
  "complete",
  "complete_with_limitations",
  "omit_item",
  "run_failed_no_charge",
]);
const MetricSchema = z.object({
  issuer: z.string().min(1),
  security: z.string().min(1),
  metric: z.string().min(1),
  period: z.string().min(1),
  unit: z.string().min(1),
  currency: z.string().min(1),
  registeredValue: z.number(),
  displayedValue: z.number(),
  declaredConversion: z.number().positive().default(1),
  precision: z.union([z.literal(1), z.literal(2)]),
  displayedIssuer: z.string().min(1),
  displayedPeriod: z.string().min(1),
  displayedUnit: z.string().min(1),
  displayedCurrency: z.string().min(1),
});
const SourceSchema = z.object({
  kind: z.enum(["filing", "form4", "news", "market_data"]),
  purpose: z.enum([
    "issuer_identity",
    "accounting_metric",
    "valuation_metric",
    "insider_transaction",
    "event_context",
    "market_price",
  ]),
});
const ScoreEvidenceSchema = z.object({
  directDirectionalAnswer: z.boolean(),
  strongestCountercase: z.boolean(),
  invalidationCondition: z.boolean(),
  stanceInFirstSentence: z.boolean(),
  limitationsBlockCount: z.number().int().nonnegative(),
  limitationsItemCount: z.number().int().nonnegative(),
  crossSectionThesisDuplicate: z.boolean(),
  mixedQualityFailSoftCompletion: z.boolean(),
  sourceLocaleCacheContract: z.boolean(),
  atomicPublication: z.boolean(),
});
const ScoreComponentsSchema = z.object({
  decisionUsefulness: z.number(),
  evidenceTraceability: z.number(),
  comparatorValuationDiscipline: z.number(),
  editorialClarity: z.number(),
  reliability: z.number(),
});

export const ResearchQualityFixtureSchema = z.object({
  id: z.string().min(1),
  issuerResolved: z.boolean().default(true),
  targetIssuer: z.string().min(1).default("ACME"),
  metrics: z.array(MetricSchema).default([{ issuer: "ACME", security: "ACME", metric: "revenue", period: "FY2026", unit: "usd", currency: "USD", registeredValue: 100, displayedValue: 100, declaredConversion: 1, precision: 2, displayedIssuer: "ACME", displayedPeriod: "FY2026", displayedUnit: "usd", displayedCurrency: "USD" }]),
  sources: z.array(SourceSchema).default([{ kind: "filing", purpose: "accounting_metric" }]),
  peerResult: z.object({
    emitted: z.boolean(),
    rows: z.array(z.object({ qualified: z.boolean() })),
  }).default({ emitted: true, rows: [{ qualified: true }, { qualified: true }, { qualified: true }] }),
  scenarios: z.array(
    z.object({ ordered: z.boolean(), assumptionsComplete: z.boolean() }),
  ).default([{ ordered: true, assumptionsComplete: true }]),
  coreClaims: z.array(z.object({ assessable: z.boolean() })).default([{ assessable: true }]),
  coreSections: z.array(z.string()).default(["Evidence supports a directional answer."]),
  publicTexts: z.array(z.string()).default(["Evidence supports a positive direction."]),
  precisionSamples: z.array(z.object({ kind: z.enum(["currency", "percentage", "ratio"]), text: z.string() })).default([]),
  decisiveFacts: z.array(
    z.object({ verdict: z.string(), exactSourceUrl: z.string() }),
  ).default([{ verdict: "entailed", exactSourceUrl: "https://example.com/source" }]),
  decisiveAnalyses: z.array(
    z.object({
      verdict: z.string(),
      inputIds: z.array(z.string()),
      eligibleInputIds: z.array(z.string()),
    }),
  ).default([{ verdict: "derived_supported", inputIds: ["fact-1"], eligibleInputIds: ["fact-1"] }]),
  groundedCoreAnswer: z.boolean().default(true),
  wholeEnvelopeIntegrity: z.boolean().default(true),
  scoreEvidence: ScoreEvidenceSchema.default({ directDirectionalAnswer: true, strongestCountercase: true, invalidationCondition: true, stanceInFirstSentence: true, limitationsBlockCount: 1, limitationsItemCount: 1, crossSectionThesisDuplicate: false, mixedQualityFailSoftCompletion: true, sourceLocaleCacheContract: true, atomicPublication: true }),
  expectedFatalReasons: z.array(z.enum(QUALITY_FATAL_REASONS)),
  expectedScoreComponents: ScoreComponentsSchema,
  expectedRuntimeDisposition: RuntimeDispositionSchema,
});

export type ResearchQualityFixture = z.infer<typeof ResearchQualityFixtureSchema>;
export type QualityFatalReason = (typeof QUALITY_FATAL_REASONS)[number];
export type QualityScoreComponents = z.infer<typeof ScoreComponentsSchema>;

const PURPOSES = {
  filing: new Set(["issuer_identity", "accounting_metric", "valuation_metric"]),
  form4: new Set(["issuer_identity", "insider_transaction"]),
  news: new Set(["event_context"]),
  market_data: new Set(["market_price", "valuation_metric"]),
} as const;
const WAIT_POSTURE = /\b(?:wait|conditional|needs? confirmation)\b|(?:기다|조건부|확인 필요)/iu;
const DIRECT_ORDER = /\b(?:buy|sell)\s+now\b|(?:지금\s*매수|즉시\s*매도)/iu;

function rounded(value: number, precision: 1 | 2): number {
  return Number(value.toFixed(precision));
}

function disposition(reasons: ReadonlySet<QualityFatalReason>) {
  if (reasons.size === 0) return "complete" as const;
  if (
    reasons.has("issuer_identity_unresolved") ||
    reasons.has("no_grounded_core_answer") ||
    reasons.has("whole_envelope_integrity_failure")
  )
    return "run_failed_no_charge" as const;
  if (
    [...reasons].every((reason) =>
      [
        "issuer_identity_mismatch",
        "metric_value_mismatch",
        "metric_period_mismatch",
        "metric_unit_mismatch",
        "source_purpose_mismatch",
        "unqualified_numeric_peer",
        "scenario_direction_invalid",
        "non_assessable_core_claim",
        "derived_input_ineligible",
      ].includes(reason),
    )
  )
    return "omit_item" as const;
  return "complete_with_limitations" as const;
}

export function evaluateResearchQuality(input: ResearchQualityFixture) {
  const reasons = new Set<QualityFatalReason>();
  if (!input.issuerResolved) reasons.add("issuer_identity_unresolved");
  for (const metric of input.metrics) {
    if (metric.issuer !== input.targetIssuer || metric.displayedIssuer !== metric.issuer)
      reasons.add("issuer_identity_mismatch");
    if (
      rounded(metric.registeredValue * metric.declaredConversion, metric.precision) !==
      metric.displayedValue
    )
      reasons.add("metric_value_mismatch");
    if (metric.period !== metric.displayedPeriod)
      reasons.add("metric_period_mismatch");
    if (
      metric.unit !== metric.displayedUnit ||
      metric.currency !== metric.displayedCurrency
    )
      reasons.add("metric_unit_mismatch");
  }
  if (input.sources.some((source) => !PURPOSES[source.kind].has(source.purpose)))
    reasons.add("source_purpose_mismatch");
  if (
    input.peerResult.emitted &&
    (input.peerResult.rows.length < 3 ||
      input.peerResult.rows.some((row) => !row.qualified))
  )
    reasons.add("unqualified_numeric_peer");
  if (input.scenarios.some((scenario) => !scenario.ordered || !scenario.assumptionsComplete))
    reasons.add("scenario_direction_invalid");
  if (input.coreClaims.some((claim) => !claim.assessable))
    reasons.add("non_assessable_core_claim");
  if (input.coreSections.filter((text) => WAIT_POSTURE.test(text)).length > 1)
    reasons.add("repeated_default_wait_posture");
  if (input.publicTexts.some((text) => DIRECT_ORDER.test(text.normalize("NFKC"))))
    reasons.add("direct_order_imperative");
  if (input.precisionSamples.some(({ kind, text }) => {
    const decimals = text.match(/\.(\d+)/u)?.[1]?.length ?? 0;
    return decimals > (kind === "percentage" ? 1 : 2);
  }))
    reasons.add("raw_public_precision");
  if (input.decisiveFacts.some((fact) => fact.verdict !== "entailed"))
    reasons.add("decisive_fact_not_entailed");
  if (input.decisiveFacts.some((fact) => !/^https:\/\/.+/u.test(fact.exactSourceUrl)))
    reasons.add("exact_source_link_missing");
  if (
    input.decisiveAnalyses.some(
      (analysis) =>
        analysis.verdict !== "derived_supported" ||
        analysis.inputIds.some((id) => !analysis.eligibleInputIds.includes(id)),
    )
  )
    reasons.add("derived_input_ineligible");
  if (!input.groundedCoreAnswer) reasons.add("no_grounded_core_answer");
  if (!input.wholeEnvelopeIntegrity)
    reasons.add("whole_envelope_integrity_failure");

  const noRepeatedWait = !reasons.has("repeated_default_wait_posture");
  const allFactsEntailed = !reasons.has("decisive_fact_not_entailed");
  const analysesSupported = !reasons.has("derived_input_ineligible");
  const exactLinks = !reasons.has("exact_source_link_missing");
  const qualifiedPeers = !reasons.has("unqualified_numeric_peer");
  const alignedMetrics = ![...reasons].some((reason) =>
    ["issuer_identity_mismatch", "metric_value_mismatch", "metric_period_mismatch", "metric_unit_mismatch"].includes(reason),
  );
  const qualifiedPeerCount = input.peerResult.rows.filter((row) => row.qualified).length;
  const peerOmissionValid = input.peerResult.emitted ? qualifiedPeerCount >= 3 && qualifiedPeerCount === input.peerResult.rows.length : qualifiedPeerCount < 3;
  const boundedPrecision = !reasons.has("raw_public_precision");
  const validScenarios = !reasons.has("scenario_direction_invalid");
  const evidence = input.scoreEvidence;
  const scoreComponents = {
    decisionUsefulness:
      (evidence.directDirectionalAnswer ? 0.75 : 0) +
      (evidence.strongestCountercase ? 0.5 : 0) +
      (evidence.invalidationCondition ? 0.5 : 0) +
      (noRepeatedWait ? 0.25 : 0),
    evidenceTraceability:
      (allFactsEntailed ? 0.75 : 0) +
      (analysesSupported ? 0.75 : 0) +
      (exactLinks ? 0.5 : 0),
    comparatorValuationDiscipline:
      (qualifiedPeers ? 0.75 : 0) +
      (alignedMetrics ? 0.75 : 0) +
      (peerOmissionValid ? 0.5 : 0),
    editorialClarity:
      (evidence.stanceInFirstSentence ? 0.75 : 0) +
      (evidence.limitationsBlockCount <= 1 && evidence.limitationsItemCount <= 3 ? 0.5 : 0) +
      (boundedPrecision ? 0.25 : 0) +
      (!evidence.crossSectionThesisDuplicate ? 0.5 : 0),
    reliability:
      (evidence.mixedQualityFailSoftCompletion ? 0.75 : 0) +
      (validScenarios ? 0.5 : 0) +
      (evidence.sourceLocaleCacheContract ? 0.5 : 0) +
      (evidence.atomicPublication ? 0.25 : 0),
  } satisfies QualityScoreComponents;
  return {
    fatalReasons: QUALITY_FATAL_REASONS.filter((reason) => reasons.has(reason)),
    scoreComponents,
    totalScore: Object.values(scoreComponents).reduce((sum, value) => sum + value, 0),
    runtimeDisposition: disposition(reasons),
    predicates: {
      directDirectionalAnswer: evidence.directDirectionalAnswer, strongestCountercase: evidence.strongestCountercase,
      invalidationCondition: evidence.invalidationCondition,
      noRepeatedWait,
      allFactsEntailed,
      analysesSupported,
      exactLinks,
      qualifiedPeers,
      alignedMetrics,
      peerOmissionValid,
      boundedPrecision,
      stanceInFirstSentence: evidence.stanceInFirstSentence, limitationsBlockCapped: evidence.limitationsBlockCount <= 1 && evidence.limitationsItemCount <= 3,
      noCrossSectionThesisDuplication: !evidence.crossSectionThesisDuplicate, mixedQualityFailSoftCompletion: evidence.mixedQualityFailSoftCompletion,
      validScenarios,
      sourceLocaleCacheContract: evidence.sourceLocaleCacheContract, atomicPublication: evidence.atomicPublication,
    },
  };
}

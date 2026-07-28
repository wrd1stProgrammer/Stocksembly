import { z } from "zod";
import {
  createValueRegistry,
  registerValue,
  type ValueRegistry,
} from "../../../domain/valueRegistry";
import {
  CORE_METRICS,
  type CoreMetric,
  metricDefinition,
  metricUnits,
  periodKind,
  TTM_METRICS,
} from "./companyFactsMetrics";
import {
  deriveGrowthSeries,
  deriveRatioSeries,
  deriveTtm,
} from "./financialNormalizerDerived";
import type {
  FinancialAvailability,
  FinancialNormalizationResult,
} from "./financialNormalizerTypes";

export type {
  FinancialAvailability,
  FinancialNormalizationResult,
} from "./financialNormalizerTypes";

function availabilityFor(
  metric: CoreMetric,
  accepted: ReadonlySet<string>,
  presented: ReadonlySet<string>,
): FinancialAvailability {
  if (accepted.has(metric)) return "available";
  return presented.has(metric) ? "unavailable" : "missing";
}

const CandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    metric: z.enum(CORE_METRICS),
    taxonomy: z.literal("us-gaap"),
    tag: z.string().min(1),
    unit: z.string().min(1),
    value: z.string().regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i),
    start: z.iso.date().optional(),
    end: z.iso.date(),
    periodKind: z.enum(["annual", "quarter", "instant"]),
    accessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    form: z.enum(["10-K", "10-K/A", "10-Q", "10-Q/A"]),
    filedAt: z.iso.datetime({ offset: true }),
    acceptedAt: z.iso.datetime({ offset: true }),
    fy: z.number().int().optional(),
    fp: z.string().optional(),
    frame: z.string().optional(),
    parentAccessionNumber: z.string().optional(),
    reason: z.literal("selected_latest_filing"),
  })
  .strict();
const InputSchema = z
  .object({
    runId: z.uuid(),
    snapshotId: z.uuid(),
    evidenceCutoffAt: z.iso.datetime({ offset: true }),
    candidates: z.array(CandidateSchema),
  })
  .strict();

function sourceMetric(
  metric: CoreMetric,
  kind: "annual" | "quarter" | "instant",
): string {
  return `${metric}_${kind}`;
}

function sourcePeriod(candidate: z.infer<typeof CandidateSchema>): string {
  switch (candidate.periodKind) {
    case "annual":
      return `FY:${candidate.end}`;
    case "quarter":
      return `Q:${candidate.end}`;
    case "instant":
      return candidate.end;
  }
}

function registerSources(input: z.infer<typeof InputSchema>): {
  readonly registry: ValueRegistry;
  readonly accepted: ReadonlySet<string>;
  readonly rejected: readonly {
    readonly candidateId: string;
    readonly reason: "mapping_mismatch" | "unit_mismatch";
  }[];
} {
  let registry = createValueRegistry({
    runId: input.runId,
    snapshotId: input.snapshotId,
  });
  const accepted = new Set<string>();
  const rejected: {
    candidateId: string;
    reason: "mapping_mismatch" | "unit_mismatch";
  }[] = [];
  for (const candidate of input.candidates) {
    const definition = metricDefinition(candidate.tag);
    if (
      definition === undefined ||
      definition.metric !== candidate.metric ||
      periodKind(candidate.start, candidate.end, definition.periodType) !==
        candidate.periodKind
    ) {
      rejected.push({
        candidateId: candidate.candidateId,
        reason: "mapping_mismatch",
      });
      continue;
    }
    if (!metricUnits(candidate.metric).includes(candidate.unit)) {
      rejected.push({
        candidateId: candidate.candidateId,
        reason: "unit_mismatch",
      });
      continue;
    }
    const result = registerValue(registry, {
      valueId: `sec:${candidate.candidateId}`,
      runId: input.runId,
      snapshotId: input.snapshotId,
      metric: sourceMetric(candidate.metric, candidate.periodKind),
      value: candidate.value,
      unit: candidate.unit,
      source: "sec_company_facts",
      accession: candidate.accessionNumber,
      form: candidate.form,
      filedAt: candidate.filedAt,
      acceptedAt: candidate.acceptedAt,
      period: sourcePeriod(candidate),
      evidenceCutoffAt: input.evidenceCutoffAt,
    });
    registry = result.registry;
    accepted.add(candidate.metric);
  }
  return { registry, accepted, rejected };
}

function deriveAll(
  registry: ValueRegistry,
  evidenceCutoffAt: string,
): ValueRegistry {
  let current = registry;
  for (const metric of TTM_METRICS)
    current = deriveTtm(current, metric, { evidenceCutoffAt });
  for (const suffix of ["annual", "quarter", "ttm"] as const) {
    current = deriveRatioSeries(current, {
      numerator: `operating_income_${suffix}`,
      denominator: `revenue_${suffix}`,
      output: `operating_margin_${suffix}`,
      evidenceCutoffAt,
    });
    current = deriveRatioSeries(current, {
      numerator: `operating_cash_flow_${suffix}`,
      denominator: `net_income_${suffix}`,
      output: `cash_conversion_${suffix}`,
      evidenceCutoffAt,
    });
  }
  current = deriveGrowthSeries(current, "revenue_annual", evidenceCutoffAt);
  return deriveGrowthSeries(current, "revenue_quarter", evidenceCutoffAt);
}

export function normalizeFinancials(
  untrustedInput: unknown,
): FinancialNormalizationResult {
  const input = InputSchema.parse(untrustedInput);
  const sources = registerSources(input);
  const presented = new Set(
    input.candidates.map((candidate) => candidate.metric),
  );
  const state = (metric: CoreMetric) =>
    availabilityFor(metric, sources.accepted, presented);
  const availability = {
    revenue: state("revenue"),
    operating_income: state("operating_income"),
    net_income: state("net_income"),
    diluted_eps: state("diluted_eps"),
    assets: state("assets"),
    liabilities: state("liabilities"),
    equity: state("equity"),
    cash: state("cash"),
    operating_cash_flow: state("operating_cash_flow"),
    capex: state("capex"),
    shares: state("shares"),
    stock_compensation: state("stock_compensation"),
  } satisfies Record<CoreMetric, FinancialAvailability>;
  return Object.freeze({
    registry: deriveAll(sources.registry, input.evidenceCutoffAt),
    availability: Object.freeze(availability),
    rejected: Object.freeze(sources.rejected),
  });
}

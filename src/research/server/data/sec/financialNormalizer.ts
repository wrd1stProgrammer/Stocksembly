import { z } from "zod";
import {
  createValueRegistry,
  deriveValue,
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
import { COMPANY_FACT_FILING_FORMS } from "./secFilingForms";

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
    periodKind: z.enum(["annual", "quarter", "ytd", "instant"]),
    accessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    form: z.enum(COMPANY_FACT_FILING_FORMS),
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
  kind: "annual" | "quarter" | "ytd" | "instant",
): string {
  return `${metric}_${kind}`;
}

function sourcePeriod(candidate: z.infer<typeof CandidateSchema>): string {
  switch (candidate.periodKind) {
    case "annual":
      return `FY:${candidate.end}`;
    case "quarter":
      return `Q:${candidate.end}`;
    case "ytd":
      return `YTD:${candidate.start}:${candidate.end}`;
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

function deriveCumulativeQuarters(
  registry: ValueRegistry,
  candidates: z.infer<typeof CandidateSchema>[],
  evidenceCutoffAt: string,
): ValueRegistry {
  let current = registry;
  // Cash-flow statements commonly report YTD, not standalone Q2/Q3/Q4.
  // Only additive flows can be differenced; EPS and weighted shares cannot.
  for (const metric of TTM_METRICS) {
    const flows = candidates.filter(
      (candidate) =>
        candidate.metric === metric &&
        candidate.start !== undefined &&
        current.records.some(
          (record) => record.valueId === `sec:${candidate.candidateId}`,
        ),
    );
    for (const latest of flows) {
      if (!["ytd", "annual"].includes(latest.periodKind)) continue;
      if (
        current.records.some(
          (record) =>
            record.metric === `${metric}_quarter` &&
            record.period === `Q:${latest.end}`,
        )
      )
        continue;
      const previous = flows
        .filter((candidate) => {
          const days =
            (Date.parse(latest.end) - Date.parse(candidate.end)) / 86_400_000;
          return (
            candidate.start === latest.start &&
            candidate.unit === latest.unit &&
            candidate.tag === latest.tag &&
            days >= 70 &&
            days <= 120
          );
        })
        .sort((left, right) => right.end.localeCompare(left.end))[0];
      if (previous === undefined) continue;
      current = deriveValue(current, {
        valueId: `${metric}:quarter_from_ytd:${latest.end}`,
        metric: `${metric}_quarter`,
        operation: "subtract",
        numeratorValueId: `sec:${latest.candidateId}`,
        denominatorValueId: `sec:${previous.candidateId}`,
        unit: latest.unit,
        period: `Q:${latest.end}`,
        evidenceCutoffAt,
        accession: latest.accessionNumber,
        form: latest.form,
        filedAt: latest.filedAt,
        acceptedAt: latest.acceptedAt,
      }).registry;
    }
  }
  return current;
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
    registry: deriveAll(
      deriveCumulativeQuarters(
        sources.registry,
        input.candidates,
        input.evidenceCutoffAt,
      ),
      input.evidenceCutoffAt,
    ),
    availability: Object.freeze(availability),
    rejected: Object.freeze(sources.rejected),
  });
}

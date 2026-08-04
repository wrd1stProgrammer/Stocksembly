import { z } from "zod";
import {
  CompanyFactsJsonError,
  normalizeCompanyFactDecimal,
  preserveCompanyFactNumberLexemes,
} from "./companyFactsJson";
import { metricDefinition, periodKind } from "./companyFactsMetrics";
import { selectCompanyFacts } from "./companyFactsSelection";
import type {
  CompanyFactCandidate,
  SelectedCompanyFact,
} from "./companyFactsTypes";
import {
  COMPANY_FACT_FILING_FORMS,
  isRegistrationFinancialForm,
} from "./secFilingForms";

const DecimalValueSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/);
const ObservationSchema = z
  .object({
    start: z.iso.date().optional(),
    end: z.iso.date(),
    val: DecimalValueSchema,
    accn: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    fy: z
      .number()
      .int()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    fp: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    form: z.string().min(1),
    filed: z.iso.date(),
    frame: z.string().optional(),
    segment: z.unknown().optional(),
    dimensions: z.unknown().optional(),
  })
  .passthrough();
const ConceptSchema = z
  .object({
    label: z
      .string()
      .nullable()
      .transform((value) => value ?? ""),
    description: z
      .string()
      .nullable()
      .transform((value) => value ?? ""),
    units: z.record(z.string(), z.array(ObservationSchema)),
  })
  .passthrough();
const PayloadSchema = z
  .object({
    cik: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
    entityName: z.string().min(1),
    facts: z.record(z.string(), z.record(z.string(), ConceptSchema)),
  })
  .passthrough();
const FilingSchema = z
  .object({
    accessionNumber: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    parentAccessionNumber: z
      .string()
      .regex(/^\d{10}-\d{2}-\d{6}$/)
      .optional(),
    form: z.enum(COMPANY_FACT_FILING_FORMS),
    filedAt: z.iso.datetime({ offset: true }),
    acceptedAt: z.iso.datetime({ offset: true }),
    period: z.iso.date(),
  })
  .strict();
const ContextSchema = z
  .object({
    cik: z.string().regex(/^\d{10}$/),
    cutoffAt: z.iso.datetime({ offset: true }),
    retrievedAt: z.iso.datetime({ offset: true }),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    filings: z.array(FilingSchema),
  })
  .strict();

export type CompanyFactsParseResult =
  | {
      readonly kind: "parsed";
      readonly cik: string;
      readonly entityName: string;
      readonly sourceHash: string;
      readonly candidates: readonly CompanyFactCandidate[];
      readonly selected: readonly SelectedCompanyFact[];
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "invalid_context"
        | "malformed_source"
        | "cik_mismatch"
        | "post_cutoff_source";
    };

function candidateReason(input: {
  readonly taxonomy: string;
  readonly tag: string;
  readonly unit: string;
  readonly observation: z.infer<typeof ObservationSchema>;
  readonly filing: z.infer<typeof FilingSchema> | undefined;
  readonly cutoffAt: string;
  readonly ordinal: number;
}): CompanyFactCandidate {
  const definition = metricDefinition(input.tag);
  const value = normalizeCompanyFactDecimal(input.observation.val);
  const period = definition
    ? periodKind(
        input.observation.start,
        input.observation.end,
        definition.periodType,
      )
    : undefined;
  let reason: CompanyFactCandidate["reason"] = "selected_latest_filing";
  if (input.taxonomy !== "us-gaap") reason = "custom_taxonomy_unsupported";
  else if (
    input.observation.segment !== undefined ||
    input.observation.dimensions !== undefined
  )
    reason = "dimensional_unsupported";
  else if (value === undefined) reason = "unsafe_numeric_value";
  else if (definition === undefined) reason = "unsupported_metric";
  else if (!definition.units.includes(input.unit)) reason = "unit_mismatch";
  else if (input.filing === undefined) reason = "filing_not_in_lineage";
  else if (
    input.filing.form !== input.observation.form ||
    input.filing.filedAt.slice(0, 10) !== input.observation.filed ||
    (!isRegistrationFinancialForm(input.filing.form) &&
      input.filing.period !== input.observation.end)
  )
    reason = "filing_lineage_mismatch";
  else if (
    Date.parse(input.filing.filedAt) > Date.parse(input.cutoffAt) ||
    Date.parse(input.filing.acceptedAt) > Date.parse(input.cutoffAt)
  )
    reason = "post_cutoff_fact";
  else if (period === undefined) reason = "period_unsupported";
  return {
    candidateId: `${input.taxonomy}:${input.tag}:${input.unit}:${input.observation.accn}:${input.observation.start ?? "instant"}:${input.observation.end}:${input.ordinal}`,
    taxonomy: input.taxonomy,
    tag: input.tag,
    ...(definition ? { metric: definition.metric } : {}),
    unit: input.unit,
    ...(value === undefined ? {} : { value }),
    ...(input.observation.start ? { start: input.observation.start } : {}),
    end: input.observation.end,
    ...(period ? { periodKind: period } : {}),
    accessionNumber: input.observation.accn,
    ...(input.filing?.parentAccessionNumber
      ? { parentAccessionNumber: input.filing.parentAccessionNumber }
      : {}),
    form: input.observation.form,
    ...(input.filing
      ? { filedAt: input.filing.filedAt, acceptedAt: input.filing.acceptedAt }
      : {}),
    ...(input.observation.fy === undefined ? {} : { fy: input.observation.fy }),
    ...(input.observation.fp ? { fp: input.observation.fp } : {}),
    ...(input.observation.frame ? { frame: input.observation.frame } : {}),
    reason,
  };
}

export function parseCompanyFacts(
  bytes: Uint8Array,
  untrustedContext: unknown,
): CompanyFactsParseResult {
  const context = ContextSchema.safeParse(untrustedContext);
  if (!context.success) return { kind: "rejected", reason: "invalid_context" };
  if (Date.parse(context.data.retrievedAt) > Date.parse(context.data.cutoffAt))
    return { kind: "rejected", reason: "post_cutoff_source" };
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      preserveCompanyFactNumberLexemes(Buffer.from(bytes).toString("utf8")),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof CompanyFactsJsonError)
      return { kind: "rejected", reason: "malformed_source" };
    throw error;
  }
  const payload = PayloadSchema.safeParse(decoded);
  if (!payload.success) return { kind: "rejected", reason: "malformed_source" };
  if (String(payload.data.cik).padStart(10, "0") !== context.data.cik)
    return { kind: "rejected", reason: "cik_mismatch" };
  const filings = new Map(
    context.data.filings.map((filing) => [filing.accessionNumber, filing]),
  );
  const candidates: CompanyFactCandidate[] = [];
  for (const [taxonomy, concepts] of Object.entries(payload.data.facts))
    for (const [tag, concept] of Object.entries(concepts)) {
      if (
        taxonomy !== "us-gaap" &&
        Object.values(concept.units).every((rows) => rows.length === 0)
      ) {
        candidates.push({
          candidateId: `${taxonomy}:${tag}:unsupported`,
          taxonomy,
          tag,
          reason: "custom_taxonomy_unsupported",
        });
      }
      for (const [unit, observations] of Object.entries(concept.units))
        for (const observation of observations)
          candidates.push(
            candidateReason({
              taxonomy,
              tag,
              unit,
              observation,
              filing: filings.get(observation.accn),
              cutoffAt: context.data.cutoffAt,
              ordinal: candidates.length,
            }),
          );
    }
  const selected = selectCompanyFacts(candidates);
  return Object.freeze({
    kind: "parsed",
    cik: context.data.cik,
    entityName: payload.data.entityName,
    sourceHash: context.data.sourceHash,
    candidates: Object.freeze(selected.candidates),
    selected: Object.freeze(selected.selected),
  });
}

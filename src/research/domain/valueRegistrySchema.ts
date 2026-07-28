import Decimal from "decimal.js";
import { z } from "zod";
import {
  isStrictIsoDate,
  isStrictRfc3339,
  timestampMillis,
} from "./contractHelpers";
import { EVIDENCE_SOURCES } from "./evidenceSchemas";

const PreciseDecimal = Decimal.clone({ precision: 80 });
const DecimalSchema = z
  .string()
  .trim()
  .regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)
  .refine(
    (value) => new PreciseDecimal(value).isFinite(),
    "invalid decimal string",
  );
const IdSchema = z.string().trim().min(1).max(240);
export const UuidSchema = z.string().uuid();
const TimestampSchema = z
  .string()
  .refine(isStrictRfc3339, "invalid RFC3339 timestamp");
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const PeriodSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) => !/^\d{4}-\d{2}-\d{2}$/.test(value) || isStrictIsoDate(value),
    "invalid period date",
  );

const FormulaSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("add"),
      inputValueIds: z.tuple([IdSchema, IdSchema]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("subtract"),
      inputValueIds: z.tuple([IdSchema, IdSchema]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("multiply"),
      inputValueIds: z.tuple([IdSchema, IdSchema]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("divide"),
      inputValueIds: z.tuple([IdSchema, IdSchema]),
    })
    .strict(),
  z
    .object({
      operation: z.literal("divide_percent"),
      inputValueIds: z.tuple([IdSchema, IdSchema]),
    })
    .strict(),
]);
export type ValueFormula = z.infer<typeof FormulaSchema>;

export const ValueRecordSchema = z
  .object({
    kind: z.literal("value_record"),
    valueId: IdSchema,
    runId: UuidSchema,
    snapshotId: UuidSchema,
    metric: z.string().trim().min(1).max(160),
    value: DecimalSchema,
    unit: z.string().trim().min(1).max(64),
    source: z.enum(EVIDENCE_SOURCES),
    accession: z.string().trim().min(1).max(80).optional(),
    form: z.string().trim().min(1).max(32).optional(),
    filedAt: TimestampSchema.optional(),
    acceptedAt: TimestampSchema.optional(),
    period: PeriodSchema,
    evidenceCutoffAt: TimestampSchema.optional(),
    formula: FormulaSchema.optional(),
    parentValueIds: z.array(IdSchema).max(16),
    parentHashes: z.array(HashSchema).max(16),
    hash: HashSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.source.startsWith("sec_") &&
      (value.accession === undefined ||
        value.form === undefined ||
        value.filedAt === undefined ||
        value.acceptedAt === undefined)
    )
      context.addIssue({
        code: "custom",
        message: "SEC values require accession, form, filedAt, and acceptedAt",
        path: ["source"],
      });
    if (
      value.filedAt !== undefined &&
      value.acceptedAt !== undefined &&
      timestampMillis(value.acceptedAt) < timestampMillis(value.filedAt)
    )
      context.addIssue({
        code: "custom",
        message: "acceptedAt must not precede filedAt",
        path: ["acceptedAt"],
      });
    if (value.evidenceCutoffAt !== undefined) {
      for (const [field, timestamp] of [
        ["filedAt", value.filedAt],
        ["acceptedAt", value.acceptedAt],
      ] as const)
        if (
          timestamp !== undefined &&
          timestampMillis(timestamp) > timestampMillis(value.evidenceCutoffAt)
        )
          context.addIssue({
            code: "custom",
            message: `${field} is after evidence cutoff`,
            path: [field],
          });
    }
    if (value.formula === undefined && value.parentValueIds.length !== 0)
      context.addIssue({
        code: "custom",
        message: "source values cannot have parents without formula",
        path: ["parentValueIds"],
      });
    if (
      value.formula !== undefined &&
      value.parentValueIds.length !== value.formula.inputValueIds.length
    )
      context.addIssue({
        code: "custom",
        message: "formula parents must be registered explicitly",
        path: ["parentValueIds"],
      });
    if (
      value.formula !== undefined &&
      value.parentValueIds.some(
        (parentId, index) => parentId !== value.formula?.inputValueIds[index],
      )
    )
      context.addIssue({
        code: "custom",
        message: "formula input IDs must equal ordered parentValueIds",
        path: ["formula", "inputValueIds"],
      });
    if (
      value.formula !== undefined &&
      value.parentHashes.length !== value.parentValueIds.length
    )
      context.addIssue({
        code: "custom",
        message: "formula values require one parent hash per parent ID",
        path: ["parentHashes"],
      });
  });
export type ValueRecord = z.infer<typeof ValueRecordSchema>;
export type ValueRegistry = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly records: readonly ValueRecord[];
};
export type ValueDraft = Omit<
  ValueRecord,
  "kind" | "hash" | "parentValueIds" | "parentHashes" | "formula"
> & {
  readonly formula?: ValueFormula;
  readonly parentValueIds?: readonly string[];
  readonly parentHashes?: readonly string[];
};

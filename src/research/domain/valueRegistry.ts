import Decimal from "decimal.js";
import {
  ContractViolation,
  hashCanonical,
  timestampMillis,
} from "./contractHelpers";
import type { EvidenceSource } from "./evidenceSchemas";
import { assertParentLineage } from "./valueRegistryLineage";
import {
  UuidSchema,
  type ValueDraft,
  type ValueFormula,
  type ValueRecord,
  ValueRecordSchema,
  type ValueRegistry,
} from "./valueRegistrySchema";

const PreciseDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
});

export {
  type ValueDraft,
  type ValueFormula,
  type ValueRecord,
  ValueRecordSchema,
  type ValueRegistry,
} from "./valueRegistrySchema";

export function createValueRegistry(input: {
  readonly runId: string;
  readonly snapshotId: string;
}): ValueRegistry {
  UuidSchema.parse(input.runId);
  UuidSchema.parse(input.snapshotId);
  return { ...input, records: [] };
}

function hashValueRecord(value: Omit<ValueRecord, "hash">): string {
  return hashCanonical(value);
}
export function valueRecordHash(value: ValueRecord): string {
  const { hash: _hash, ...withoutHash } = value;
  return hashValueRecord(withoutHash);
}

export function registerValue(
  registry: ValueRegistry,
  input: ValueDraft,
): { readonly registry: ValueRegistry; readonly record: ValueRecord } {
  if (registry.records.some((record) => record.valueId === input.valueId))
    throw new ContractViolation(
      "immutable_overwrite",
      `value ${input.valueId} already exists`,
    );
  if (
    input.runId !== registry.runId ||
    input.snapshotId !== registry.snapshotId
  )
    throw new ContractViolation(
      "lineage_mismatch",
      "value belongs to another run or snapshot",
    );
  if (input.evidenceCutoffAt !== undefined) {
    for (const [label, timestamp] of [
      ["filedAt", input.filedAt],
      ["acceptedAt", input.acceptedAt],
    ] as const)
      if (
        timestamp !== undefined &&
        timestampMillis(timestamp) > timestampMillis(input.evidenceCutoffAt)
      )
        throw new ContractViolation(
          "post_cutoff",
          `${label} is after evidence cutoff`,
        );
  }
  assertParentLineage(registry, input);
  const withoutHash = {
    ...input,
    kind: "value_record" as const,
    parentValueIds: [...(input.parentValueIds ?? [])],
    parentHashes: [...(input.parentHashes ?? [])],
  };
  const parsed = ValueRecordSchema.parse({
    ...withoutHash,
    hash: "0".repeat(64),
  });
  const { hash: _hash, ...hashable } = parsed;
  const record = ValueRecordSchema.parse({
    ...hashable,
    hash: hashValueRecord(hashable),
  });
  return {
    registry: { ...registry, records: [...registry.records, record] },
    record,
  };
}

type DerivedValueDraft = Omit<
  ValueDraft,
  | "value"
  | "formula"
  | "parentValueIds"
  | "parentHashes"
  | "runId"
  | "snapshotId"
  | "source"
  | "accession"
  | "form"
  | "filedAt"
  | "acceptedAt"
  | "period"
  | "evidenceCutoffAt"
> & {
  readonly runId?: string;
  readonly snapshotId?: string;
  readonly source?: EvidenceSource;
  readonly accession?: string;
  readonly form?: string;
  readonly filedAt?: string;
  readonly acceptedAt?: string;
  readonly period?: string;
  readonly evidenceCutoffAt?: string;
  readonly operation: ValueFormula["operation"];
  readonly numeratorValueId: string;
  readonly denominatorValueId: string;
};

function findRecord(registry: ValueRegistry, valueId: string): ValueRecord {
  const record = registry.records.find(
    (candidate) => candidate.valueId === valueId,
  );
  if (record === undefined)
    throw new ContractViolation(
      "missing_input",
      `value ${valueId} is missing; missing is never zero`,
    );
  if (
    record.runId !== registry.runId ||
    record.snapshotId !== registry.snapshotId
  )
    throw new ContractViolation(
      "lineage_mismatch",
      `value ${valueId} crosses run or snapshot lineage`,
    );
  return record;
}

function calculate(
  operation: ValueFormula["operation"],
  numerator: ValueRecord,
  denominator: ValueRecord,
): string {
  const left = new PreciseDecimal(numerator.value);
  const right = new PreciseDecimal(denominator.value);
  switch (operation) {
    case "add":
      return left.plus(right).toFixed();
    case "subtract":
      return left.minus(right).toFixed();
    case "multiply":
      return left.times(right).toFixed();
    case "divide":
      if (right.isZero())
        throw new ContractViolation(
          "division_by_zero",
          "cannot divide by zero",
        );
      return left.div(right).toFixed();
    case "divide_percent":
      if (right.isZero())
        throw new ContractViolation(
          "division_by_zero",
          "cannot divide by zero",
        );
      return left.div(right).times(100).toFixed();
    default:
      throw new ContractViolation(
        "unknown_formula",
        "unsupported value formula",
      );
  }
}

export function deriveValue(
  registry: ValueRegistry,
  input: DerivedValueDraft,
): { readonly registry: ValueRegistry; readonly record: ValueRecord } {
  const numerator = findRecord(registry, input.numeratorValueId);
  const denominator = findRecord(registry, input.denominatorValueId);
  if (
    (input.operation === "add" ||
      input.operation === "subtract" ||
      input.operation === "divide_percent") &&
    numerator.unit !== denominator.unit
  )
    throw new ContractViolation(
      "unit_mismatch",
      `${input.operation} requires matching units`,
    );
  const formula: ValueFormula = {
    operation: input.operation,
    inputValueIds: [input.numeratorValueId, input.denominatorValueId],
  };
  const {
    operation: _operation,
    numeratorValueId: _numeratorValueId,
    denominatorValueId: _denominatorValueId,
    ...derivedFields
  } = input;
  return registerValue(registry, {
    ...derivedFields,
    runId: input.runId ?? registry.runId,
    snapshotId: input.snapshotId ?? registry.snapshotId,
    source: input.source ?? numerator.source,
    ...((input.accession ?? numerator.accession)
      ? { accession: input.accession ?? numerator.accession }
      : {}),
    ...((input.form ?? numerator.form)
      ? { form: input.form ?? numerator.form }
      : {}),
    ...((input.filedAt ?? numerator.filedAt)
      ? { filedAt: input.filedAt ?? numerator.filedAt }
      : {}),
    ...((input.acceptedAt ?? numerator.acceptedAt)
      ? { acceptedAt: input.acceptedAt ?? numerator.acceptedAt }
      : {}),
    period: input.period ?? numerator.period,
    ...((input.evidenceCutoffAt ?? numerator.evidenceCutoffAt)
      ? {
          evidenceCutoffAt:
            input.evidenceCutoffAt ?? numerator.evidenceCutoffAt,
        }
      : {}),
    formula,
    parentValueIds: [numerator.valueId, denominator.valueId],
    parentHashes: [numerator.hash, denominator.hash],
    value: calculate(input.operation, numerator, denominator),
  });
}

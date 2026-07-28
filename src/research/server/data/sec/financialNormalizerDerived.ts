import Decimal from "decimal.js";
import {
  deriveValue,
  type ValueRecord,
  type ValueRegistry,
} from "../../../domain/valueRegistry";
import type { CoreMetric } from "./companyFactsMetrics";

type DerivationContext = {
  readonly evidenceCutoffAt: string;
};

function latestSource(records: readonly ValueRecord[]): ValueRecord {
  const ordered = [...records].sort(
    (left, right) =>
      Date.parse(right.acceptedAt ?? "1970-01-01T00:00:00.000Z") -
      Date.parse(left.acceptedAt ?? "1970-01-01T00:00:00.000Z"),
  );
  const record = ordered[0];
  if (record === undefined)
    throw new TypeError("latestSource requires at least one record");
  return record;
}

function derivedSource(record: ValueRecord): {
  readonly accession?: string;
  readonly form?: string;
  readonly filedAt?: string;
  readonly acceptedAt?: string;
} {
  return {
    ...(record.accession ? { accession: record.accession } : {}),
    ...(record.form ? { form: record.form } : {}),
    ...(record.filedAt ? { filedAt: record.filedAt } : {}),
    ...(record.acceptedAt ? { acceptedAt: record.acceptedAt } : {}),
  };
}

export function deriveTtm(
  registry: ValueRegistry,
  metric: CoreMetric,
  context: DerivationContext,
): ValueRegistry {
  const quarters = registry.records
    .filter((record) => record.metric === `${metric}_quarter`)
    .sort((left, right) => left.period.localeCompare(right.period))
    .slice(-4);
  if (quarters.length !== 4) return registry;
  const endDates = quarters.map((record) => record.period.slice(2));
  if (
    endDates.slice(1).some((end, index) => {
      const previous = endDates[index];
      if (previous === undefined) return true;
      const days = (Date.parse(end) - Date.parse(previous)) / 86_400_000;
      return days < 75 || days > 105;
    })
  )
    return registry;
  const source = latestSource(quarters);
  let currentRegistry = registry;
  let accumulator = quarters[0];
  if (accumulator === undefined) return registry;
  for (const [index, quarter] of quarters.slice(1).entries()) {
    const isFinal = index === 2;
    const result = deriveValue(currentRegistry, {
      valueId: `${metric}:ttm:${endDates[3]}:${index + 1}`,
      metric: isFinal ? `${metric}_ttm` : `${metric}_ttm_component`,
      operation: "add",
      numeratorValueId: accumulator.valueId,
      denominatorValueId: quarter.valueId,
      unit: quarter.unit,
      period: `TTM:${endDates[3]}`,
      evidenceCutoffAt: context.evidenceCutoffAt,
      ...derivedSource(source),
    });
    currentRegistry = result.registry;
    accumulator = result.record;
  }
  return currentRegistry;
}

function matchingRecords(
  registry: ValueRegistry,
  metric: string,
): ReadonlyMap<string, ValueRecord> {
  return new Map(
    registry.records
      .filter((record) => record.metric === metric)
      .map((record) => [record.period, record]),
  );
}

export function deriveRatioSeries(
  registry: ValueRegistry,
  input: {
    readonly numerator: string;
    readonly denominator: string;
    readonly output: string;
    readonly evidenceCutoffAt: string;
  },
): ValueRegistry {
  const numerators = matchingRecords(registry, input.numerator);
  const denominators = matchingRecords(registry, input.denominator);
  let current = registry;
  for (const [period, numerator] of numerators) {
    const denominator = denominators.get(period);
    if (denominator === undefined || new Decimal(denominator.value).isZero())
      continue;
    const result = deriveValue(current, {
      valueId: `${input.output}:${period}`,
      metric: input.output,
      operation: "divide_percent",
      numeratorValueId: numerator.valueId,
      denominatorValueId: denominator.valueId,
      unit: "percent",
      period,
      evidenceCutoffAt: input.evidenceCutoffAt,
      ...derivedSource(latestSource([numerator, denominator])),
    });
    current = result.registry;
  }
  return current;
}

export function deriveGrowthSeries(
  registry: ValueRegistry,
  metric: string,
  evidenceCutoffAt: string,
): ValueRegistry {
  const records = registry.records
    .filter((record) => record.metric === metric)
    .sort((left, right) => left.period.localeCompare(right.period));
  let current = registry;
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const latest = records[index];
    if (previous === undefined || latest === undefined) continue;
    if (new Decimal(previous.value).isZero()) continue;
    const delta = deriveValue(current, {
      valueId: `${metric}:growth_delta:${latest.period}`,
      metric: `${metric}_growth_delta`,
      operation: "subtract",
      numeratorValueId: latest.valueId,
      denominatorValueId: previous.valueId,
      unit: latest.unit,
      period: latest.period,
      evidenceCutoffAt,
      ...derivedSource(latest),
    });
    const growth = deriveValue(delta.registry, {
      valueId: `${metric}:growth:${latest.period}`,
      metric: `${metric}_growth_percent`,
      operation: "divide_percent",
      numeratorValueId: delta.record.valueId,
      denominatorValueId: previous.valueId,
      unit: "percent",
      period: latest.period,
      evidenceCutoffAt,
      ...derivedSource(latest),
    });
    current = growth.registry;
  }
  return current;
}

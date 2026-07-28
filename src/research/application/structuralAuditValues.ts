import Decimal from "decimal.js";
import type { ValueRecord, ValueRegistry } from "../domain/valueRegistry";
import { valueRecordHash } from "../domain/valueRegistry";

const Decimal80 = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
});

function calculate(
  record: ValueRecord,
  records: ReadonlyMap<string, ValueRecord>,
): string | undefined {
  if (record.formula === undefined) return record.value;
  const [leftId, rightId] = record.formula.inputValueIds;
  const left = records.get(leftId);
  const right = records.get(rightId);
  if (
    left === undefined ||
    right === undefined ||
    record.parentHashes[0] !== left.hash ||
    record.parentHashes[1] !== right.hash
  )
    return undefined;
  const a = new Decimal80(left.value);
  const b = new Decimal80(right.value);
  switch (record.formula.operation) {
    case "add":
      return a.plus(b).toFixed();
    case "subtract":
      return a.minus(b).toFixed();
    case "multiply":
      return a.times(b).toFixed();
    case "divide":
      return b.isZero() ? undefined : a.div(b).toFixed();
    case "divide_percent":
      return b.isZero() ? undefined : a.div(b).times(100).toFixed();
  }
}

export function valueAssertionReproduces(
  registry: ValueRegistry,
  assertion: { readonly valueId: string; readonly renderedValue: string },
  runId: string,
  snapshotId: string,
): boolean {
  const records = new Map(
    registry.records.map((record) => [record.valueId, record]),
  );
  const record = records.get(assertion.valueId);
  if (
    record === undefined ||
    record.runId !== runId ||
    record.snapshotId !== snapshotId ||
    valueRecordHash(record) !== record.hash
  )
    return false;
  const calculated = calculate(record, records);
  return (
    calculated !== undefined &&
    new Decimal80(calculated).equals(record.value) &&
    new Decimal80(record.value).equals(assertion.renderedValue)
  );
}

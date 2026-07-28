import { describe, expect, it } from "vitest";
import {
  createValueRegistry,
  deriveValue,
  registerValue,
  type ValueRegistry,
  valueRecordHash,
} from "./valueRegistry";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";
const BASE = {
  runId: RUN_ID,
  snapshotId: SNAPSHOT_ID,
  source: "sec_company_facts" as const,
  accession: "0000000001-26-000001",
  form: "10-Q",
  filedAt: "2026-07-20T12:00:00.000Z",
  acceptedAt: "2026-07-20T12:01:00.000Z",
  period: "2026-Q2",
};

function registry(): ValueRegistry {
  return createValueRegistry({ runId: RUN_ID, snapshotId: SNAPSHOT_ID });
}

describe("decimal-string value registry", () => {
  it("recomputes a derived margin from two SEC values exactly", () => {
    const revenue = registerValue(registry(), {
      valueId: "revenue",
      metric: "revenue",
      value: "125.00",
      unit: "USD",
      ...BASE,
    });
    const profit = registerValue(revenue.registry, {
      valueId: "profit",
      metric: "operating_profit",
      value: "25",
      unit: "USD",
      ...BASE,
    });
    const margin = deriveValue(profit.registry, {
      valueId: "margin",
      metric: "operating_margin",
      operation: "divide_percent",
      numeratorValueId: "profit",
      denominatorValueId: "revenue",
      unit: "percent",
    });

    expect(margin.record.value).toBe("20");
    expect(margin.record.formula).toMatchObject({
      operation: "divide_percent",
    });
    expect(margin.record.parentValueIds).toEqual(["profit", "revenue"]);
  });

  it("rejects missing values instead of coercing missing to zero", () => {
    expect(() =>
      deriveValue(registry(), {
        valueId: "margin",
        metric: "operating_margin",
        operation: "divide_percent",
        numeratorValueId: "missing-profit",
        denominatorValueId: "missing-revenue",
        unit: "percent",
      }),
    ).toThrow(/missing|unknown/i);
  });

  it("rejects wrong units, cross-snapshot inputs, and post-cutoff filing values", () => {
    const first = registerValue(registry(), {
      valueId: "revenue",
      metric: "revenue",
      value: "100",
      unit: "shares",
      ...BASE,
    });
    const secondRegistry = createValueRegistry({
      runId: RUN_ID,
      snapshotId: "00000000-0000-4000-8000-000000000099",
    });
    const other = registerValue(secondRegistry, {
      valueId: "profit",
      metric: "profit",
      value: "20",
      unit: "USD",
      ...BASE,
      snapshotId: secondRegistry.snapshotId,
    });
    const sameSnapshotProfit = registerValue(first.registry, {
      valueId: "same-snapshot-profit",
      metric: "profit",
      value: "20",
      unit: "USD",
      ...BASE,
    });
    expect(() =>
      deriveValue(sameSnapshotProfit.registry, {
        valueId: "wrong-unit-margin",
        metric: "margin",
        operation: "divide_percent",
        numeratorValueId: "same-snapshot-profit",
        denominatorValueId: "revenue",
        unit: "percent",
      }),
    ).toThrow(/unit/i);
    expect(() =>
      deriveValue(first.registry, {
        valueId: "margin",
        metric: "margin",
        operation: "divide_percent",
        numeratorValueId: "profit",
        denominatorValueId: "revenue",
        unit: "percent",
      }),
    ).toThrow(/missing|unknown/i);
    const firstRecord = first.registry.records[0];
    const otherRecord = other.registry.records[0];
    if (firstRecord === undefined || otherRecord === undefined)
      throw new Error("lineage fixture missing");
    expect(() =>
      deriveValue(
        { ...first.registry, records: [firstRecord, otherRecord] },
        {
          valueId: "margin",
          metric: "margin",
          operation: "divide_percent",
          numeratorValueId: "profit",
          denominatorValueId: "revenue",
          unit: "percent",
        },
      ),
    ).toThrow(/snapshot|lineage/i);
    expect(() =>
      registerValue(registry(), {
        valueId: "future",
        metric: "future",
        value: "1",
        unit: "USD",
        ...BASE,
        filedAt: "2026-07-23T00:00:00.000Z",
        acceptedAt: "2026-07-23T00:00:00.000Z",
        evidenceCutoffAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toThrow(/cutoff/i);
  });

  it("hashes equivalent records deterministically and has no mutable authority fields", () => {
    const result = registerValue(registry(), {
      valueId: "x",
      metric: "x",
      value: "1.0",
      unit: "USD",
      ...BASE,
    });
    expect(result.record.hash).toBe(valueRecordHash(result.record));
    expect("role" in result.record).toBe(false);
    expect("isTrusted" in result.record).toBe(false);
  });

  it("requires ordered formula IDs and matching content-addressed parent hashes", () => {
    const revenue = registerValue(registry(), {
      valueId: "revenue-parent",
      metric: "revenue",
      value: "125",
      unit: "USD",
      ...BASE,
    });
    const profit = registerValue(revenue.registry, {
      valueId: "profit-parent",
      metric: "profit",
      value: "25",
      unit: "USD",
      ...BASE,
    });
    const revenueRecord = revenue.registry.records[0];
    const profitRecord = profit.registry.records[1];
    if (revenueRecord === undefined || profitRecord === undefined)
      throw new Error("parent fixture missing");
    expect(() =>
      registerValue(profit.registry, {
        valueId: "bad-order",
        metric: "margin",
        value: "20",
        unit: "percent",
        ...BASE,
        formula: {
          operation: "divide_percent",
          inputValueIds: ["profit-parent", "revenue-parent"],
        },
        parentValueIds: ["revenue-parent", "profit-parent"],
        parentHashes: [revenueRecord.hash, profitRecord.hash],
      }),
    ).toThrow(/parent|formula/i);
    expect(() =>
      registerValue(profit.registry, {
        valueId: "missing-parent-hash",
        metric: "margin",
        value: "20",
        unit: "percent",
        ...BASE,
        formula: {
          operation: "divide_percent",
          inputValueIds: ["profit-parent", "revenue-parent"],
        },
        parentValueIds: ["profit-parent", "revenue-parent"],
        parentHashes: [],
      }),
    ).toThrow(/hash|parent/i);
    expect(() =>
      registerValue(profit.registry, {
        valueId: "tampered-parent-hash",
        metric: "margin",
        value: "20",
        unit: "percent",
        ...BASE,
        formula: {
          operation: "divide_percent",
          inputValueIds: ["profit-parent", "revenue-parent"],
        },
        parentValueIds: ["profit-parent", "revenue-parent"],
        parentHashes: ["0".repeat(64), revenueRecord.hash],
      }),
    ).toThrow(/hash|parent|integrity/i);
    const tamperedRegistry: ValueRegistry = {
      ...profit.registry,
      records: profit.registry.records.map((record) =>
        record.valueId === "profit-parent"
          ? { ...record, value: "26" }
          : record,
      ),
    };
    expect(() =>
      registerValue(tamperedRegistry, {
        valueId: "tampered-parent-record",
        metric: "margin",
        value: "20",
        unit: "percent",
        ...BASE,
        formula: {
          operation: "divide_percent",
          inputValueIds: ["profit-parent", "revenue-parent"],
        },
        parentValueIds: ["profit-parent", "revenue-parent"],
        parentHashes: [profitRecord.hash, revenueRecord.hash],
      }),
    ).toThrow(/hash|integrity|parent/i);
  });

  it("rejects calendar-invalid and offset-invalid SEC timestamps", () => {
    expect(() =>
      registerValue(registry(), {
        valueId: "invalid-date-value",
        metric: "revenue",
        value: "1",
        unit: "USD",
        ...BASE,
        filedAt: "2026-02-30T00:00:00.000Z",
        acceptedAt: "2026-03-01T00:00:00.000Z",
      }),
    ).toThrow(/timestamp|date/i);
    expect(() =>
      registerValue(registry(), {
        valueId: "invalid-offset-value",
        metric: "revenue",
        value: "1",
        unit: "USD",
        ...BASE,
        filedAt: "2026-07-20T12:00:00.000+24:00",
        acceptedAt: "2026-07-20T12:01:00.000Z",
      }),
    ).toThrow(/timestamp|date|offset/i);
    expect(() =>
      registerValue(registry(), {
        valueId: "invalid-period-value",
        metric: "revenue",
        value: "1",
        unit: "USD",
        ...BASE,
        period: "2026-02-30",
      }),
    ).toThrow(/period|date/i);
  });
});

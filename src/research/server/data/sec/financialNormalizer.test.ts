import { describe, expect, it } from "vitest";
import { valueRecordHash } from "../../../domain/valueRegistry";
import { CORE_METRICS } from "./companyFactsMetrics";
import { normalizeFinancials } from "./financialNormalizer";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";

const DURATION_TAGS = {
  revenue: "Revenues",
  operating_income: "OperatingIncomeLoss",
  net_income: "NetIncomeLoss",
  diluted_eps: "EarningsPerShareDiluted",
  operating_cash_flow: "NetCashProvidedByUsedInOperatingActivities",
} as const;

type DurationMetric = keyof typeof DURATION_TAGS;

const CORE_MAP = [
  ["revenue", "Revenues", "USD", "quarter"],
  ["operating_income", "OperatingIncomeLoss", "USD", "quarter"],
  ["net_income", "NetIncomeLoss", "USD", "quarter"],
  ["diluted_eps", "EarningsPerShareDiluted", "USD/shares", "quarter"],
  ["assets", "Assets", "USD", "instant"],
  ["liabilities", "Liabilities", "USD", "instant"],
  ["equity", "StockholdersEquity", "USD", "instant"],
  ["cash", "CashAndCashEquivalentsAtCarryingValue", "USD", "instant"],
  [
    "operating_cash_flow",
    "NetCashProvidedByUsedInOperatingActivities",
    "USD",
    "quarter",
  ],
  ["capex", "PaymentsToAcquirePropertyPlantAndEquipment", "USD", "quarter"],
  ["shares", "EntityCommonStockSharesOutstanding", "shares", "instant"],
  ["stock_compensation", "ShareBasedCompensation", "USD", "quarter"],
] as const;

function selected(metric: DurationMetric, values: readonly string[]) {
  const ends = [
    "2024-03-31",
    "2024-06-30",
    "2024-09-30",
    "2024-12-31",
  ] as const;
  const filed = [
    "2024-04-15T00:00:00.000Z",
    "2024-07-15T00:00:00.000Z",
    "2024-10-15T00:00:00.000Z",
    "2025-01-15T00:00:00.000Z",
  ] as const;
  const accepted = [
    "2024-04-15T12:00:00.000Z",
    "2024-07-15T12:00:00.000Z",
    "2024-10-15T12:00:00.000Z",
    "2025-01-15T12:00:00.000Z",
  ] as const;
  return values.map((value, index) => ({
    candidateId: `${metric}-${index + 1}`,
    metric,
    taxonomy: "us-gaap",
    tag: DURATION_TAGS[metric],
    unit: metric === "diluted_eps" ? "USD/shares" : "USD",
    value,
    start: `2024-${String(index * 3 + 1).padStart(2, "0")}-01`,
    end: ends[index] ?? "invalid",
    periodKind: "quarter" as const,
    accessionNumber: `0001045810-24-00000${index + 1}`,
    form: "10-Q",
    filedAt: filed[index] ?? "invalid",
    acceptedAt: accepted[index] ?? "invalid",
    fy: 2024,
    fp: `Q${index + 1}`,
    reason: "selected_latest_filing" as const,
  }));
}

describe("normalizeFinancials", () => {
  it("registers annual/quarter/TTM values and exactly reproducible derived margins", () => {
    // Given four exact-decimal quarters from selected Company Facts.
    const candidates = [
      ...selected("revenue", ["0.1", "0.2", "0.3", "0.4"]),
      ...selected("operating_income", ["0.01", "0.02", "0.03", "0.04"]),
      ...selected("net_income", ["0.005", "0.01", "0.015", "0.02"]),
      ...selected("operating_cash_flow", ["0.01", "0.02", "0.03", "0.04"]),
    ];

    // When the selected facts are normalized into the immutable registry.
    const result = normalizeFinancials({
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      evidenceCutoffAt: "2025-03-01T00:00:00.000Z",
      candidates,
    });

    // Then TTM and margin preserve exact decimal arithmetic and complete lineage.
    expect(result.availability.revenue).toBe("available");
    expect(result.availability.net_income).toBe("available");
    const revenueTtm = result.registry.records.find(
      (record) => record.metric === "revenue_ttm",
    );
    const incomeTtm = result.registry.records.find(
      (record) => record.metric === "operating_income_ttm",
    );
    const margin = result.registry.records.find(
      (record) => record.metric === "operating_margin_ttm",
    );
    const cashConversion = result.registry.records.find(
      (record) => record.metric === "cash_conversion_ttm",
    );
    const growth = result.registry.records.filter(
      (record) => record.metric === "revenue_quarter_growth_percent",
    );
    expect(revenueTtm?.value).toBe("1");
    expect(incomeTtm?.value).toBe("0.1");
    expect(margin?.value).toBe("10");
    expect(cashConversion?.value).toBe("200");
    expect(growth).toHaveLength(3);
    expect(growth[2]?.formula?.operation).toBe("divide_percent");
    expect(margin?.formula).toEqual({
      operation: "divide_percent",
      inputValueIds: [incomeTtm?.valueId, revenueTtm?.valueId],
    });
    expect(margin?.parentHashes).toEqual([incomeTtm?.hash, revenueTtm?.hash]);
    expect(margin === undefined ? undefined : valueRecordHash(margin)).toBe(
      margin?.hash,
    );
  });

  it("preserves missing metrics and refuses unit-mixed or incomplete derivations", () => {
    // Given shares mislabeled as revenue and only three valid revenue quarters.
    const candidates = [
      ...selected("revenue", ["1", "2", "3"]).map((candidate, index) =>
        index === 0 ? { ...candidate, unit: "shares" } : candidate,
      ),
      ...selected("operating_income", ["1", "1", "1", "1"]),
    ];

    // When normalization applies the documented metric unit contract.
    const result = normalizeFinancials({
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      evidenceCutoffAt: "2025-03-01T00:00:00.000Z",
      candidates,
    });

    // Then no zero, TTM revenue, or margin is invented.
    expect(result.rejected).toContainEqual({
      candidateId: "revenue-1",
      reason: "unit_mismatch",
    });
    expect(result.availability.revenue).toBe("available");
    expect(
      result.registry.records.some((record) => record.metric === "revenue_ttm"),
    ).toBe(false);
    expect(
      result.registry.records.some(
        (record) => record.metric === "operating_margin_ttm",
      ),
    ).toBe(false);
    expect(result.availability.net_income).toBe("missing");
  });

  it("does not add filed diluted EPS across four quarters", () => {
    // Given four directly filed quarterly diluted EPS values.
    const candidates = selected("diluted_eps", ["1", "2", "3", "4"]);

    // When the selected facts are normalized.
    const result = normalizeFinancials({
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      evidenceCutoffAt: "2025-03-01T00:00:00.000Z",
      candidates,
    });

    // Then no additive TTM EPS is fabricated.
    expect(
      result.registry.records.some(
        (record) => record.metric === "diluted_eps_ttm",
      ),
    ).toBe(false);
  });

  it("rejects a valid Assets tag forged as revenue", () => {
    // Given a schema-valid candidate whose metric contradicts its code-owned tag.
    const revenue = selected("revenue", ["100"])[0];
    if (revenue === undefined) throw new TypeError("revenue fixture missing");
    const { start: _start, ...durationFields } = revenue;
    const forged = {
      ...durationFields,
      metric: "revenue" as const,
      tag: "Assets",
      periodKind: "instant" as const,
    };

    // When the public normalizer parses the forged mapping.
    const result = normalizeFinancials({
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      evidenceCutoffAt: "2025-03-01T00:00:00.000Z",
      candidates: [forged],
    });

    // Then the fact is unavailable and no revenue record is registered.
    expect(result.rejected).toContainEqual({
      candidateId: forged.candidateId,
      reason: "mapping_mismatch",
    });
    expect(result.availability.revenue).toBe("unavailable");
    expect(result.registry.records).toHaveLength(0);
  });

  it("accepts only the documented tag, unit, and period mapping for every core metric", () => {
    // Given one exact code-owned mapping for each core metric.
    const candidates = CORE_MAP.map(
      ([metric, tag, unit, periodKind], index) => ({
        candidateId: `core-${metric}`,
        metric,
        taxonomy: "us-gaap" as const,
        tag,
        unit,
        value: String(index + 1),
        ...(periodKind === "quarter" ? { start: "2024-01-01" } : {}),
        end: "2024-03-31",
        periodKind,
        accessionNumber: `0001045810-24-${String(index + 1).padStart(6, "0")}`,
        form: "10-Q" as const,
        filedAt: "2024-04-15T00:00:00.000Z",
        acceptedAt: "2024-04-15T12:00:00.000Z",
        reason: "selected_latest_filing" as const,
      }),
    );

    // When the public normalizer enforces the complete metric map.
    const result = normalizeFinancials({
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      evidenceCutoffAt: "2025-03-01T00:00:00.000Z",
      candidates,
    });

    // Then every documented mapping registers and no candidate is rejected.
    expect(result.rejected).toEqual([]);
    expect(
      CORE_METRICS.every(
        (metric) => result.availability[metric] === "available",
      ),
    ).toBe(true);
    expect(
      result.registry.records.filter((record) => record.formula === undefined),
    ).toHaveLength(CORE_METRICS.length);
  });
});

import type { ValueRecord } from "./valueRegistry";

export function researchFinancialBoard(values: readonly ValueRecord[]) {
  const records = values.filter(
    (value) =>
      value.source === "sec_company_facts" &&
      /revenue|income|margin|cash|capex|debt|share|receivable|inventory|growth/iu.test(
        value.metric,
      ),
  );
  const groups = new Map<string, ValueRecord[]>();
  for (const record of records) {
    const key = `${record.metric}:${record.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? ""),
      );
      const unique = ordered
        .filter(
          (value, index) =>
            ordered.findIndex((item) => item.period === value.period) === index,
        )
        .slice(0, 5);
      return {
        metric: unique[0]?.metric,
        unit: unique[0]?.unit,
        latestPeriod: unique[0]?.period,
        observations: unique.map((value) => ({
          valueId: value.valueId,
          period: value.period,
          value: value.value,
          basis:
            value.formula?.operation === "subtract"
              ? "derived_from_reported_periods"
              : "registered_value",
        })),
      };
    })
    .slice(0, 30);
}

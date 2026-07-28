export type ComparableProviderValue = {
  readonly value: string;
  readonly period: string;
  readonly unit: string;
  readonly currency: string;
};

export type ProviderValueReconciliation = {
  readonly authoritative: {
    readonly source: "sec_company_facts";
    readonly value: string;
  };
  readonly providerValue: string;
  readonly disagreements: readonly (
    | "period_mismatch"
    | "unit_mismatch"
    | "currency_mismatch"
    | "value_mismatch"
  )[];
  readonly limitations: readonly string[];
};

export function reconcileLicensedProviderValue(input: {
  readonly metric: string;
  readonly sec: ComparableProviderValue;
  readonly provider: ComparableProviderValue;
}): ProviderValueReconciliation {
  const disagreements: ProviderValueReconciliation["disagreements"][number][] =
    [];
  if (input.sec.period !== input.provider.period)
    disagreements.push("period_mismatch");
  if (input.sec.unit !== input.provider.unit) disagreements.push("unit_mismatch");
  if (input.sec.currency !== input.provider.currency)
    disagreements.push("currency_mismatch");
  if (
    disagreements.length === 0 &&
    input.sec.value !== input.provider.value
  )
    disagreements.push("value_mismatch");
  return Object.freeze({
    authoritative: Object.freeze({
      source: "sec_company_facts",
      value: input.sec.value,
    }),
    providerValue: input.provider.value,
    disagreements: Object.freeze(disagreements),
    limitations: Object.freeze(
      disagreements.map((reason) => `insightsentry_sec_${reason}`),
    ),
  });
}

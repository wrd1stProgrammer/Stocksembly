import type {
  EvidenceDataset,
  SourceLocator,
  SourcePurpose,
} from "./evidenceCoreSchemas";

function normalizedForm(form: string): string {
  return form.trim().toUpperCase();
}

function isOwnershipForm(form: string): boolean {
  return /^(?:3|4|5)(?:\/A)?$/u.test(normalizedForm(form));
}

function isAccountingForm(form: string): boolean {
  return /^(?:10-K|10-Q)(?:\/A)?$/u.test(normalizedForm(form));
}

function hasDataset(
  dataset: EvidenceDataset,
  locator: SourceLocator,
  allowed: readonly EvidenceDataset[],
): boolean {
  return (
    locator.kind === "licensed_provider" &&
    locator.dataset === dataset &&
    allowed.includes(dataset)
  );
}

export function sourcePurposesFor(input: {
  readonly dataset: EvidenceDataset;
  readonly locator: SourceLocator;
}): readonly SourcePurpose[] {
  const { dataset, locator } = input;
  if (
    locator.kind === "sec_filing" &&
    dataset === "sec_insider_transactions" &&
    locator.source === "sec_primary_filing" &&
    isOwnershipForm(locator.form)
  )
    return ["ownership"];
  if (
    locator.kind === "macro" &&
    dataset === "bls_macro" &&
    locator.source === "bls_allowlist"
  )
    return ["macro"];
  if (
    locator.kind === "treasury" &&
    dataset === "treasury_yield" &&
    locator.source === "treasury_yield"
  )
    return ["macro"];
  if (locator.kind === "market" && dataset === "market_bars")
    return ["market_price_technical"];
  if (
    hasDataset(dataset, locator, [
      "market_bars",
      "insightsentry_quote",
      "insightsentry_options",
    ])
  )
    return ["market_price_technical"];
  if (
    hasDataset(dataset, locator, [
      "insightsentry_fundamentals",
      "insightsentry_peers",
    ])
  )
    return ["valuation_metric"];
  if (
    hasDataset(dataset, locator, [
      "insightsentry_news",
      "insightsentry_news_company",
      "insightsentry_news_market",
      "insightsentry_news_financial",
      "insightsentry_news_risk",
      "insightsentry_calendar",
    ])
  )
    return ["event_catalyst"];
  if (
    locator.kind === "sec_filing" &&
    ((dataset === "sec_company_facts" &&
      locator.source === "sec_company_facts") ||
      (dataset === "sec_filing" &&
        locator.source === "sec_primary_filing" &&
        isAccountingForm(locator.form)))
  )
    return ["accounting_metric"];
  if (
    locator.kind === "sec_filing" &&
    dataset === "sec_filing" &&
    locator.source === "sec_primary_filing" &&
    normalizedForm(locator.form) === "8-K"
  )
    return ["event_catalyst"];
  return [];
}

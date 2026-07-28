import type { CoreMetric, FactPeriodKind } from "./companyFactsMetrics";

export const SELECTION_REASONS = [
  "selected_latest_filing",
  "superseded_by_amendment",
  "superseded_by_later_filing",
  "duplicate_same_value",
  "conflicting_duplicate",
  "custom_taxonomy_unsupported",
  "dimensional_unsupported",
  "unsupported_metric",
  "unit_mismatch",
  "filing_not_in_lineage",
  "filing_lineage_mismatch",
  "post_cutoff_fact",
  "period_unsupported",
  "lower_priority_tag",
  "unsafe_numeric_value",
] as const;

export type SelectionReason = (typeof SELECTION_REASONS)[number];

export type CompanyFactCandidate = {
  readonly candidateId: string;
  readonly taxonomy: string;
  readonly tag: string;
  readonly metric?: CoreMetric;
  readonly unit?: string;
  readonly value?: string;
  readonly start?: string;
  readonly end?: string;
  readonly periodKind?: FactPeriodKind;
  readonly accessionNumber?: string;
  readonly parentAccessionNumber?: string;
  readonly form?: string;
  readonly filedAt?: string;
  readonly acceptedAt?: string;
  readonly fy?: number;
  readonly fp?: string;
  readonly frame?: string;
  readonly reason: SelectionReason;
};

export type SelectedCompanyFact = CompanyFactCandidate & {
  readonly metric: CoreMetric;
  readonly unit: string;
  readonly value: string;
  readonly end: string;
  readonly periodKind: FactPeriodKind;
  readonly accessionNumber: string;
  readonly form: string;
  readonly filedAt: string;
  readonly acceptedAt: string;
  readonly reason: "selected_latest_filing";
};

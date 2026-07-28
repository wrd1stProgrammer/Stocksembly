import { z } from "zod";
import { assertNever } from "./ids";
import { SOURCE_METADATA, type SourceMetadata } from "./rights.metadata";

export const RIGHTS_SOURCES = [
  "sec_ticker_exchange",
  "sec_submissions",
  "sec_company_facts",
  "sec_primary_filing",
  "sec_exhibit",
  "bls_allowlist",
  "treasury_yield",
  "alpaca_market_data",
  "insightsentry_rapidapi",
  "captured_web",
] as const;
export type RightsSource = (typeof RIGHTS_SOURCES)[number];
export const RIGHTS_SURFACES = [
  "model_transfer",
  "ui_report",
  "export",
] as const;
export type RightsSurface = (typeof RIGHTS_SURFACES)[number];
export type RightsDecisionKind =
  | "allowed"
  | "withheld_by_rights"
  | "rights_unknown";

export type RightsSurfacePolicy = {
  readonly source: RightsSource | undefined;
  readonly surface: RightsSurface;
  readonly decision: RightsDecisionKind;
  readonly modelPayload: string;
  readonly surfaceContent: string;
  readonly linkOnly: boolean;
  readonly sanitizerRequired: boolean;
  readonly maxExcerptChars: number;
  readonly retention: "raw_local_only" | "metadata_hash_only";
  readonly rawExport: "denied" | "same_report_content" | "metadata_hash_only";
  readonly excludedContent: readonly string[];
  readonly pitSemantics: string;
};

type BlockedRights = {
  readonly kind: "blocked";
  readonly reason: "withheld_by_rights" | "rights_unknown";
  readonly source?: RightsSource;
};
export type RightsDecision =
  | {
      readonly kind: "allowed";
      readonly source: RightsSource;
      readonly sanitizerRequired: boolean;
    }
  | BlockedRights;
export type SnapshotRightsOutcome =
  | { readonly kind: "allowed" }
  | BlockedRights;

const UNKNOWN_POLICY: RightsSurfacePolicy = {
  source: undefined,
  surface: "model_transfer",
  decision: "rights_unknown",
  modelPayload: "none",
  surfaceContent: "none",
  linkOnly: false,
  sanitizerRequired: false,
  maxExcerptChars: 0,
  retention: "metadata_hash_only",
  rawExport: "metadata_hash_only",
  excludedContent: [],
  pitSemantics: "unknown",
};

type PolicyRow = Pick<
  RightsSurfacePolicy,
  | "decision"
  | "modelPayload"
  | "surfaceContent"
  | "linkOnly"
  | "sanitizerRequired"
  | "maxExcerptChars"
>;
type PolicyTable = Readonly<
  Record<
    RightsSource,
    Readonly<Record<RightsSurface, PolicyRow & SourceMetadata>>
  >
>;

type CellOptions = Partial<
  Pick<
    PolicyRow,
    "decision" | "linkOnly" | "sanitizerRequired" | "maxExcerptChars"
  >
>;
const cell = (
  modelPayload: string,
  surfaceContent: string,
  options: CellOptions = {},
): PolicyRow => ({
  decision: "allowed",
  modelPayload,
  surfaceContent,
  linkOnly: false,
  sanitizerRequired: false,
  maxExcerptChars: 0,
  ...options,
});
const surfaces = (
  source: RightsSource,
  model_transfer: PolicyRow,
  ui_report = model_transfer,
  exportPolicy = model_transfer,
): Readonly<Record<RightsSurface, PolicyRow & SourceMetadata>> => ({
  model_transfer: { ...model_transfer, ...SOURCE_METADATA[source] },
  ui_report: { ...ui_report, ...SOURCE_METADATA[source] },
  export: { ...exportPolicy, ...SOURCE_METADATA[source] },
});

export const SOURCE_BY_SURFACE_RIGHTS = {
  sec_ticker_exchange: surfaces(
    "sec_ticker_exchange",
    cell("identity_fields", "identity_and_official_url"),
    cell("identity_fields", "identity_and_official_url"),
    cell("identity_fields", "report_identity_metadata"),
  ),
  sec_submissions: surfaces(
    "sec_submissions",
    cell("filing_metadata_only", "filing_chronology_and_links"),
  ),
  sec_company_facts: surfaces(
    "sec_company_facts",
    cell(
      "selected_registered_values_and_lineage",
      "derived_facts_with_citations",
    ),
    cell(
      "selected_registered_values_and_lineage",
      "derived_facts_with_citations",
    ),
    cell(
      "selected_registered_values_and_lineage",
      "claim_value_registry_with_attribution",
    ),
  ),
  sec_primary_filing: surfaces(
    "sec_primary_filing",
    cell("sanitized_primary_text", "claim_supporting_text_and_links", {
      sanitizerRequired: true,
    }),
    cell("sanitized_primary_text", "claim_supporting_text_and_links", {
      sanitizerRequired: true,
      maxExcerptChars: 500,
    }),
    cell("sanitized_primary_text", "same_report_content", {
      sanitizerRequired: true,
      maxExcerptChars: 500,
    }),
  ),
  sec_exhibit: surfaces(
    "sec_exhibit",
    cell("none", "official_link_and_withheld_reason", {
      decision: "withheld_by_rights",
      linkOnly: true,
    }),
    undefined,
    cell("none", "none", { decision: "withheld_by_rights" }),
  ),
  bls_allowlist: surfaces(
    "bls_allowlist",
    cell("series_date_value_footnote", "values_with_bls_citation"),
    undefined,
    cell("series_date_value_footnote", "same_values_and_citation"),
  ),
  treasury_yield: surfaces(
    "treasury_yield",
    cell("date_tenor_value", "values_with_treasury_citation"),
    undefined,
    cell("date_tenor_value", "same_values_and_citation"),
  ),
  alpaca_market_data: surfaces(
    "alpaca_market_data",
    cell(
      "adjusted_daily_ohlcv_and_derived_indicators",
      "derived_market_metrics_with_provider_attribution",
    ),
    cell(
      "derived_market_metrics",
      "derived_market_metrics_with_provider_attribution",
    ),
    cell("derived_market_metrics", "same_report_content"),
  ),
  insightsentry_rapidapi: surfaces(
    "insightsentry_rapidapi",
    cell(
      "bounded_normalized_provider_values",
      "derived_values_with_provider_attribution",
    ),
    cell(
      "bounded_normalized_provider_values",
      "derived_values_with_provider_attribution",
    ),
    cell("derived_values_only", "same_report_content"),
  ),
  captured_web: surfaces(
    "captured_web",
    cell("sanitized_bounded_excerpt", "bounded_excerpt_and_source_link", {
      sanitizerRequired: true,
      maxExcerptChars: 500,
    }),
    undefined,
    cell("none", "source_link_and_metadata", {
      sanitizerRequired: true,
      linkOnly: true,
    }),
  ),
} satisfies PolicyTable;

export function rightsForSurface(
  source: unknown,
  surface: unknown,
): RightsSurfacePolicy {
  const parsedSource = z.enum(RIGHTS_SOURCES).safeParse(source);
  const parsedSurface = z.enum(RIGHTS_SURFACES).safeParse(surface);
  if (!parsedSource.success || !parsedSurface.success) {
    return {
      ...UNKNOWN_POLICY,
      surface: parsedSurface.success ? parsedSurface.data : "model_transfer",
    };
  }
  return {
    source: parsedSource.data,
    surface: parsedSurface.data,
    ...SOURCE_BY_SURFACE_RIGHTS[parsedSource.data][parsedSurface.data],
  };
}

export function evaluateModelTransfer(source: unknown): RightsDecision {
  const policy = rightsForSurface(source, "model_transfer");
  switch (policy.decision) {
    case "allowed":
      if (policy.source === undefined)
        return { kind: "blocked", reason: "rights_unknown" };
      return {
        kind: "allowed",
        source: policy.source,
        sanitizerRequired: policy.sanitizerRequired,
      };
    case "withheld_by_rights":
      return {
        kind: "blocked",
        reason: "withheld_by_rights",
        ...(policy.source === undefined ? {} : { source: policy.source }),
      };
    case "rights_unknown":
      return { kind: "blocked", reason: "rights_unknown" };
    default:
      return assertNever(policy.decision);
  }
}

export function checkSnapshotRights(
  sources: readonly unknown[],
): SnapshotRightsOutcome {
  for (const source of sources) {
    const decision = evaluateModelTransfer(source);
    if (decision.kind === "blocked") return decision;
  }
  return { kind: "allowed" };
}

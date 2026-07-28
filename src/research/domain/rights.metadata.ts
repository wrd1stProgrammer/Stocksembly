import type { RightsSource, RightsSurfacePolicy } from "./rights";

export type SourceMetadata = Pick<
  RightsSurfacePolicy,
  "retention" | "rawExport" | "excludedContent" | "pitSemantics"
>;

const metadata = (
  retention: SourceMetadata["retention"],
  rawExport: SourceMetadata["rawExport"],
  pitSemantics: string,
  excludedContent: readonly string[] = [],
): SourceMetadata => ({ retention, rawExport, excludedContent, pitSemantics });
const rawLocalNoExport = (pitSemantics: string): SourceMetadata =>
  metadata("raw_local_only", "denied", pitSemantics);
const rawLocalReport = (pitSemantics: string): SourceMetadata =>
  metadata("raw_local_only", "same_report_content", pitSemantics);

export const SOURCE_METADATA = {
  sec_ticker_exchange: rawLocalNoExport(
    "point_in_time_from_sec_reference_retrieval",
  ),
  sec_submissions: rawLocalNoExport("filed_and_accepted_times_bound_cutoff"),
  sec_company_facts: rawLocalNoExport("registered_value_lineage_bound_cutoff"),
  sec_primary_filing: metadata(
    "raw_local_only",
    "same_report_content",
    "filed_and_accepted_times_bound_cutoff",
    ["images", "logos", "pii", "third_party_exhibits"],
  ),
  sec_exhibit: metadata(
    "metadata_hash_only",
    "metadata_hash_only",
    "link_only_metadata",
    ["third_party_exhibits"],
  ),
  bls_allowlist: rawLocalReport(
    "observation_date_preserved_release_time_unavailable_retrieval_at_controls_pit",
  ),
  treasury_yield: rawLocalReport(
    "observation_date_preserved_publication_time_unavailable_retrieval_at_controls_pit",
  ),
  alpaca_market_data: rawLocalNoExport(
    "adjusted_daily_bar_timestamp_and_retrieval_time_bound_cutoff",
  ),
  insightsentry_rapidapi: rawLocalNoExport(
    "provider_update_and_retrieval_times_preserved_not_point_in_time_safe",
  ),
  captured_web: metadata(
    "raw_local_only",
    "denied",
    "retrieval_time_bound_attempt_fenced_web_capture",
    ["scripts", "styles", "credentials", "personal_data"],
  ),
} satisfies Record<RightsSource, SourceMetadata>;

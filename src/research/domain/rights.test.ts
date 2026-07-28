import { describe, expect, it } from "vitest";
import { assertNever } from "./ids";
import {
  evaluateModelTransfer,
  RIGHTS_SOURCES,
  RIGHTS_SURFACES,
  type RightsDecision,
  rightsForSurface,
  SOURCE_BY_SURFACE_RIGHTS,
} from "./rights";

function decisionTag(value: RightsDecision): string {
  switch (value.kind) {
    case "allowed":
      return "allowed";
    case "blocked":
      return value.reason;
    default:
      return assertNever(value);
  }
}

describe("source-by-surface rights", () => {
  it("allows sanitized primary SEC filing transfer but caps displayed excerpts", () => {
    const policy = rightsForSurface("sec_primary_filing", "model_transfer");
    const uiPolicy = rightsForSurface("sec_primary_filing", "ui_report");

    expect(policy).toMatchObject({
      decision: "allowed",
      sanitizerRequired: true,
    });
    expect(uiPolicy).toMatchObject({
      decision: "allowed",
      maxExcerptChars: 500,
    });
  });

  it("withholds SEC exhibits from model and export surfaces", () => {
    expect(decisionTag(evaluateModelTransfer("sec_exhibit"))).toBe(
      "withheld_by_rights",
    );
    expect(rightsForSurface("sec_exhibit", "export").decision).toBe(
      "withheld_by_rights",
    );
  });

  it("returns rights_unknown for an unregistered source instead of inheriting rights", () => {
    expect(rightsForSurface("not_registered", "model_transfer")).toMatchObject({
      decision: "rights_unknown",
      maxExcerptChars: 0,
      sanitizerRequired: false,
    });
    expect(decisionTag(evaluateModelTransfer("not_registered"))).toBe(
      "rights_unknown",
    );
  });

  it("locks every source/surface cell and source-specific retention semantics", () => {
    const expected = {
      sec_ticker_exchange: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: [],
        pitSemantics: "point_in_time_from_sec_reference_retrieval",
        model_transfer: {
          decision: "allowed",
          modelPayload: "identity_fields",
          surfaceContent: "identity_and_official_url",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "identity_fields",
          surfaceContent: "identity_and_official_url",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "identity_fields",
          surfaceContent: "report_identity_metadata",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      sec_submissions: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: [],
        pitSemantics: "filed_and_accepted_times_bound_cutoff",
        model_transfer: {
          decision: "allowed",
          modelPayload: "filing_metadata_only",
          surfaceContent: "filing_chronology_and_links",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "filing_metadata_only",
          surfaceContent: "filing_chronology_and_links",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "filing_metadata_only",
          surfaceContent: "filing_chronology_and_links",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      sec_company_facts: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: [],
        pitSemantics: "registered_value_lineage_bound_cutoff",
        model_transfer: {
          decision: "allowed",
          modelPayload: "selected_registered_values_and_lineage",
          surfaceContent: "derived_facts_with_citations",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "selected_registered_values_and_lineage",
          surfaceContent: "derived_facts_with_citations",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "selected_registered_values_and_lineage",
          surfaceContent: "claim_value_registry_with_attribution",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      sec_primary_filing: {
        retention: "raw_local_only",
        rawExport: "same_report_content",
        excludedContent: ["images", "logos", "pii", "third_party_exhibits"],
        pitSemantics: "filed_and_accepted_times_bound_cutoff",
        model_transfer: {
          decision: "allowed",
          modelPayload: "sanitized_primary_text",
          surfaceContent: "claim_supporting_text_and_links",
          linkOnly: false,
          sanitizerRequired: true,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "sanitized_primary_text",
          surfaceContent: "claim_supporting_text_and_links",
          linkOnly: false,
          sanitizerRequired: true,
          maxExcerptChars: 500,
        },
        export: {
          decision: "allowed",
          modelPayload: "sanitized_primary_text",
          surfaceContent: "same_report_content",
          linkOnly: false,
          sanitizerRequired: true,
          maxExcerptChars: 500,
        },
      },
      sec_exhibit: {
        retention: "metadata_hash_only",
        rawExport: "metadata_hash_only",
        excludedContent: ["third_party_exhibits"],
        pitSemantics: "link_only_metadata",
        model_transfer: {
          decision: "withheld_by_rights",
          modelPayload: "none",
          surfaceContent: "official_link_and_withheld_reason",
          linkOnly: true,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "withheld_by_rights",
          modelPayload: "none",
          surfaceContent: "official_link_and_withheld_reason",
          linkOnly: true,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "withheld_by_rights",
          modelPayload: "none",
          surfaceContent: "none",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      bls_allowlist: {
        retention: "raw_local_only",
        rawExport: "same_report_content",
        excludedContent: [],
        pitSemantics:
          "observation_date_preserved_release_time_unavailable_retrieval_at_controls_pit",
        model_transfer: {
          decision: "allowed",
          modelPayload: "series_date_value_footnote",
          surfaceContent: "values_with_bls_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "series_date_value_footnote",
          surfaceContent: "values_with_bls_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "series_date_value_footnote",
          surfaceContent: "same_values_and_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      treasury_yield: {
        retention: "raw_local_only",
        rawExport: "same_report_content",
        excludedContent: [],
        pitSemantics:
          "observation_date_preserved_publication_time_unavailable_retrieval_at_controls_pit",
        model_transfer: {
          decision: "allowed",
          modelPayload: "date_tenor_value",
          surfaceContent: "values_with_treasury_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "date_tenor_value",
          surfaceContent: "values_with_treasury_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "date_tenor_value",
          surfaceContent: "same_values_and_citation",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      alpaca_market_data: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: [],
        pitSemantics:
          "adjusted_daily_bar_timestamp_and_retrieval_time_bound_cutoff",
        model_transfer: {
          decision: "allowed",
          modelPayload: "adjusted_daily_ohlcv_and_derived_indicators",
          surfaceContent: "derived_market_metrics_with_provider_attribution",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "derived_market_metrics",
          surfaceContent: "derived_market_metrics_with_provider_attribution",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "derived_market_metrics",
          surfaceContent: "same_report_content",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      insightsentry_rapidapi: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: [],
        pitSemantics:
          "provider_update_and_retrieval_times_preserved_not_point_in_time_safe",
        model_transfer: {
          decision: "allowed",
          modelPayload: "bounded_normalized_provider_values",
          surfaceContent: "derived_values_with_provider_attribution",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "bounded_normalized_provider_values",
          surfaceContent: "derived_values_with_provider_attribution",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
        export: {
          decision: "allowed",
          modelPayload: "derived_values_only",
          surfaceContent: "same_report_content",
          linkOnly: false,
          sanitizerRequired: false,
          maxExcerptChars: 0,
        },
      },
      captured_web: {
        retention: "raw_local_only",
        rawExport: "denied",
        excludedContent: ["scripts", "styles", "credentials", "personal_data"],
        pitSemantics: "retrieval_time_bound_attempt_fenced_web_capture",
        model_transfer: {
          decision: "allowed",
          modelPayload: "sanitized_bounded_excerpt",
          surfaceContent: "bounded_excerpt_and_source_link",
          linkOnly: false,
          sanitizerRequired: true,
          maxExcerptChars: 500,
        },
        ui_report: {
          decision: "allowed",
          modelPayload: "sanitized_bounded_excerpt",
          surfaceContent: "bounded_excerpt_and_source_link",
          linkOnly: false,
          sanitizerRequired: true,
          maxExcerptChars: 500,
        },
        export: {
          decision: "allowed",
          modelPayload: "none",
          surfaceContent: "source_link_and_metadata",
          linkOnly: true,
          sanitizerRequired: true,
          maxExcerptChars: 0,
        },
      },
    } as const;

    expect(RIGHTS_SOURCES).toHaveLength(10);
    expect(RIGHTS_SURFACES).toHaveLength(3);
    for (const source of RIGHTS_SOURCES) {
      const sourceExpected = expected[source];
      for (const surface of RIGHTS_SURFACES) {
        expect(rightsForSurface(source, surface)).toEqual({
          source,
          surface,
          ...sourceExpected[surface],
          retention: sourceExpected.retention,
          rawExport: sourceExpected.rawExport,
          excludedContent: sourceExpected.excludedContent,
          pitSemantics: sourceExpected.pitSemantics,
        });
        expect(SOURCE_BY_SURFACE_RIGHTS[source][surface]).toMatchObject({
          retention: sourceExpected.retention,
          rawExport: sourceExpected.rawExport,
          excludedContent: sourceExpected.excludedContent,
          pitSemantics: sourceExpected.pitSemantics,
        });
      }
    }
  });
});

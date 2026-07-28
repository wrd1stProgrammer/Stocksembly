import type { CapabilityKey } from "../domain/capabilities";
import type { RightsSource } from "../domain/rights";
import type { SpecialistRoleId } from "../domain/roleRegistry";
import type { SnapshotDataset } from "./buildSnapshot";
import type { MaterialCrux } from "./createMandateContracts";

export type RoleAssignmentPolicy = {
  readonly roleId: SpecialistRoleId;
  readonly agentName: string;
  readonly primaryCrux: MaterialCrux;
  readonly focusAreas: readonly string[];
  readonly allowedDatasets: readonly SnapshotDataset[];
  readonly allowedRightsSources: readonly RightsSource[];
  readonly capabilityKeys: readonly CapabilityKey[];
  readonly requiredOutputs: readonly string[];
  readonly forbiddenOutputs: readonly string[];
};

const SEC_TEXT = ["sec_primary_filing", "sec_submissions"] as const;
const SEC_DATASETS = ["sec_filing", "sec_company_facts"] as const;
const MACRO_SOURCES = ["bls_allowlist", "treasury_yield"] as const;
const MACRO_DATASETS = ["bls_macro", "treasury_yield"] as const;
const MARKET_SOURCES = ["alpaca_market_data"] as const;
const MARKET_DATASETS = ["market_bars"] as const;
const PROVIDER_SOURCES = ["insightsentry_rapidapi"] as const;

export const ROLE_ASSIGNMENT_POLICIES = [
  {
    roleId: "market",
    agentName: "Maya",
    primaryCrux: "macro_regime",
    focusAreas: ["official_macro", "market_regime", "price_regime"],
    allowedDatasets: [
      ...MACRO_DATASETS,
      "insightsentry_quote",
      "insightsentry_news_market",
    ],
    allowedRightsSources: [
      ...MACRO_SOURCES,
      ...MARKET_SOURCES,
      ...PROVIDER_SOURCES,
    ],
    capabilityKeys: [
      "bls_macro",
      "treasury_yield",
      "current_market_data",
      "professional_news",
    ],
    requiredOutputs: ["macro_regime", "market_regime", "observed_coverage"],
    forbiddenOutputs: [],
  },
  {
    roleId: "market_news",
    agentName: "June",
    primaryCrux: "disclosure_chronology",
    focusAreas: [
      "one_hour_short_term_structure",
      "four_hour_medium_term_structure",
      "moving_averages",
      "rsi",
      "macd",
      "atr_volatility",
      "volume_confirmation",
      "support_resistance",
      "invalidation_levels",
      "timeframe_agreement",
    ],
    allowedDatasets: [...MARKET_DATASETS, "sec_filing"],
    allowedRightsSources: [...MARKET_SOURCES, ...PROVIDER_SOURCES, ...SEC_TEXT],
    capabilityKeys: ["current_market_data"],
    requiredOutputs: [
      "one_hour_entry_structure",
      "four_hour_medium_term_structure",
      "moving_averages_rsi_macd_atr_volume",
      "support_resistance",
      "invalidation_levels",
      "timeframe_agreement_or_disagreement",
      "observed_coverage",
    ],
    forbiddenOutputs: [
      "direct_trade_instruction",
      "guaranteed_return",
      "valuation_analysis",
      "fundamental_analysis",
      "news_summary",
    ],
  },
  {
    roleId: "benchmark",
    agentName: "Alex",
    primaryCrux: "competition_positioning",
    focusAreas: [
      "sector_index_context",
      "peer_relative_performance",
      "cross_asset_regime",
      "rate_beta_sensitivity",
    ],
    allowedDatasets: [
      ...MACRO_DATASETS,
      ...MARKET_DATASETS,
      "insightsentry_quote",
      "insightsentry_peers",
      "insightsentry_fundamentals",
    ],
    allowedRightsSources: [
      ...MACRO_SOURCES,
      ...MARKET_SOURCES,
      ...PROVIDER_SOURCES,
    ],
    capabilityKeys: [
      "treasury_yield",
      "current_market_data",
      "sec_company_facts",
    ],
    requiredOutputs: [
      "benchmark_relative_performance",
      "sector_index_context",
      "rate_beta_sensitivity",
      "peer_dispersion",
      "base_hypothesis",
      "competing_hypothesis",
      "observed_coverage",
    ],
    forbiddenOutputs: ["direct_trade_instruction", "guaranteed_return"],
  },
  {
    roleId: "company",
    agentName: "Ethan",
    primaryCrux: "business_segments",
    focusAreas: [
      "business_model",
      "segments",
      "management_discussion_analysis",
    ],
    allowedDatasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_calendar",
      "insightsentry_news_company",
    ],
    allowedRightsSources: [...SEC_TEXT, ...PROVIDER_SOURCES],
    capabilityKeys: ["sec_filings", "professional_news"],
    requiredOutputs: ["business_model", "material_company_events"],
    forbiddenOutputs: [],
  },
  {
    roleId: "company_product",
    agentName: "Aria",
    primaryCrux: "product_adoption",
    focusAreas: ["product", "adoption", "customer_evidence"],
    allowedDatasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_news_company",
    ],
    allowedRightsSources: [...SEC_TEXT, ...PROVIDER_SOURCES],
    capabilityKeys: ["sec_filings", "professional_news"],
    requiredOutputs: ["product_adoption", "customer_evidence"],
    forbiddenOutputs: [],
  },
  {
    roleId: "company_competition",
    agentName: "Leo",
    primaryCrux: "competition_positioning",
    focusAreas: ["competition", "positioning"],
    allowedDatasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_peers",
    ],
    allowedRightsSources: [...SEC_TEXT, ...PROVIDER_SOURCES],
    capabilityKeys: ["sec_filings"],
    requiredOutputs: ["competitive_position", "peer_context"],
    forbiddenOutputs: [],
  },
  {
    roleId: "financial",
    agentName: "Noah",
    primaryCrux: "financial_trends",
    focusAreas: ["financial_statements", "financial_trends"],
    allowedDatasets: [...SEC_DATASETS, "insightsentry_fundamentals"],
    allowedRightsSources: [
      "sec_primary_filing",
      "sec_company_facts",
      ...PROVIDER_SOURCES,
    ],
    capabilityKeys: ["sec_filings", "sec_company_facts"],
    requiredOutputs: ["financial_trends", "provider_official_disagreements"],
    forbiddenOutputs: [],
  },
  {
    roleId: "valuation",
    agentName: "Sofia",
    primaryCrux: "operating_sensitivity",
    focusAreas: [
      "provider_fundamentals",
      "valuation_multiples",
      "fundamental_sensitivity",
      "earnings_power_sensitivity",
    ],
    allowedDatasets: [
      ...SEC_DATASETS,
      "insightsentry_fundamentals",
      "insightsentry_quote",
      "insightsentry_peers",
    ],
    allowedRightsSources: [
      "sec_primary_filing",
      "sec_company_facts",
      ...PROVIDER_SOURCES,
    ],
    capabilityKeys: ["sec_filings", "sec_company_facts", "current_market_data"],
    requiredOutputs: [
      "valuation_multiples",
      "fundamental_sensitivity",
      "earnings_power_sensitivity",
      "observed_coverage",
    ],
    forbiddenOutputs: [
      "direct_trade_instruction",
      "guaranteed_return",
      "chart_technical_analysis",
      "news_summary",
    ],
  },
  {
    roleId: "financial_quality",
    agentName: "Hana",
    primaryCrux: "earnings_quality",
    focusAreas: [
      "cash_conversion",
      "accruals",
      "restatements",
      "auditor_quality",
    ],
    allowedDatasets: [
      ...SEC_DATASETS,
      "insightsentry_fundamentals",
      "insightsentry_documents",
    ],
    allowedRightsSources: [
      "sec_primary_filing",
      "sec_company_facts",
      ...PROVIDER_SOURCES,
    ],
    capabilityKeys: ["sec_filings", "sec_company_facts"],
    requiredOutputs: ["earnings_quality", "provider_official_disagreements"],
    forbiddenOutputs: [],
  },
  {
    roleId: "risk",
    agentName: "Liam",
    primaryCrux: "downside_risk",
    focusAreas: ["downside", "risk_factors"],
    allowedDatasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_news_risk",
      "insightsentry_options",
    ],
    allowedRightsSources: [...SEC_TEXT, ...PROVIDER_SOURCES],
    capabilityKeys: ["sec_filings", "professional_news", "options"],
    requiredOutputs: ["downside_risks", "material_risk_events"],
    forbiddenOutputs: [],
  },
  {
    roleId: "risk_policy",
    agentName: "Min",
    primaryCrux: "policy_transmission",
    focusAreas: ["policy", "regulatory", "macro_transmission"],
    allowedDatasets: [
      "sec_filing",
      ...MACRO_DATASETS,
      "insightsentry_calendar",
      "insightsentry_news_risk",
    ],
    allowedRightsSources: [...SEC_TEXT, ...MACRO_SOURCES, ...PROVIDER_SOURCES],
    capabilityKeys: [
      "sec_filings",
      "bls_macro",
      "treasury_yield",
      "professional_news",
    ],
    requiredOutputs: ["policy_transmission", "material_policy_events"],
    forbiddenOutputs: [],
  },
] as const satisfies readonly RoleAssignmentPolicy[];

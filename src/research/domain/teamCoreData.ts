import type { z } from "zod";
import type { SnapshotDataset } from "../application/buildSnapshot";
import type { EditorialDecisionDimensionSchema } from "./agentOutputsShared";
import type { WorkflowDepartmentId } from "./roleRegistry";

export type TeamCoreDataContract = {
  readonly datasets: readonly SnapshotDataset[];
  readonly metricIds: readonly string[];
  readonly decisionDimensions: readonly z.infer<
    typeof EditorialDecisionDimensionSchema
  >[];
  readonly decisionFrame: string;
  readonly requiredInvestorOutputs: readonly string[];
};

export const TEAM_CORE_DATA = {
  market: {
    decisionDimensions: [
      "regime",
      "timing",
      "relative_performance",
      "catalyst",
    ],
    datasets: [
      "market_bars",
      "insightsentry_quote",
      "insightsentry_news_market",
      "insightsentry_peers",
      "insightsentry_fundamentals",
      "treasury_yield",
      "bls_macro",
      "sec_institutional_holdings",
    ],
    metricIds: [
      "last_price",
      "relative_performance_3m",
      "relative_performance_1y",
      "rsi_1h",
      "rsi_4h",
      "volume_confirmation",
      "treasury_10y",
      "core_cpi_trend",
      "nonfarm_payroll_trend",
      "average_hourly_earnings_trend",
      "producer_price_trend",
      "beneficial_owner_change",
      "peer_dispersion",
    ],
    decisionFrame:
      "Separate trend, relative strength, expectations, and macro regime. State which observable change would invalidate the market view.",
    requiredInvestorOutputs: [
      "current market regime and its transmission into the stock",
      "relative strength versus a qualified peer or sector reference",
      "entry or waiting signal from price, volume, and momentum",
      "dated catalyst plus confirmation and invalidation conditions",
    ],
  },
  company: {
    decisionDimensions: [
      "growth_engine",
      "adoption",
      "moat",
      "competitive_erosion",
    ],
    datasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_calendar",
      "insightsentry_news_company",
      "insightsentry_fundamentals",
      "insightsentry_peers",
      "sec_insider_transactions",
      "sec_institutional_holdings",
    ],
    metricIds: [
      "segment_revenue_mix",
      "geographic_revenue_mix",
      "segment_growth",
      "product_adoption",
      "customer_concentration",
      "competitive_margin_gap",
      "insider_net_activity",
      "beneficial_owner_change",
      "next_company_event",
    ],
    decisionFrame:
      "Prove the business mechanism: product or segment change, competitive response, and the operating KPI that confirms or breaks the moat.",
    requiredInvestorOutputs: [
      "named growth engine and the operating evidence behind it",
      "production adoption or monetization proof",
      "moat mechanism that protects economics",
      "credible erosion path and the milestone that reveals it",
    ],
  },
  financial: {
    decisionDimensions: [
      "margin",
      "cash_conversion",
      "reinvestment",
      "embedded_expectations",
    ],
    datasets: [
      "sec_company_facts",
      "sec_filing",
      "insightsentry_fundamentals",
      "insightsentry_calendar",
      "insightsentry_quote",
      "insightsentry_news_financial",
      "insightsentry_peers",
      "insightsentry_documents",
      "sec_insider_transactions",
      "sec_institutional_holdings",
    ],
    metricIds: [
      "revenue_growth",
      "gross_margin",
      "operating_margin",
      "free_cash_flow",
      "cash_conversion",
      "net_debt",
      "diluted_shares",
      "forward_eps",
      "forward_revenue",
      "insider_net_activity",
      "beneficial_owner_change",
      "peer_valuation_premium",
    ],
    decisionFrame:
      "Bridge growth to cash generation and valuation. Distinguish reported results, forward expectations, and the margin of safety implied by the current price.",
    requiredInvestorOutputs: [
      "revenue-to-margin bridge",
      "earnings-to-free-cash-flow conversion",
      "reinvestment intensity and return quality",
      "expectations embedded in price and the reset threshold",
    ],
  },
  risk: {
    decisionDimensions: ["downside_path", "leading_indicator", "mitigant"],
    datasets: [
      "sec_filing",
      "insightsentry_documents",
      "insightsentry_news_risk",
      "insightsentry_calendar",
      "insightsentry_fundamentals",
      "insightsentry_quote",
      "treasury_yield",
      "bls_macro",
      "sec_insider_transactions",
      "sec_institutional_holdings",
    ],
    metricIds: [
      "downside_trigger",
      "revenue_at_risk",
      "margin_at_risk",
      "net_cash_buffer",
      "geographic_concentration",
      "customer_concentration",
      "policy_event",
      "core_cpi_trend",
      "labor_market_trend",
      "wage_pressure",
      "producer_price_pressure",
      "insider_net_activity",
      "beneficial_owner_change",
      "recovery_condition",
    ],
    decisionFrame:
      "Build a causal downside path with trigger, transmission, financial impact, buffer, and recovery condition. Do not substitute generic uncertainty language.",
    requiredInvestorOutputs: [
      "ranked downside path with an explicit trigger",
      "earliest measurable warning signal",
      "financial or valuation transmission",
      "mitigant, remaining exposure, and recovery condition",
    ],
  },
} as const satisfies Readonly<
  Record<WorkflowDepartmentId, TeamCoreDataContract>
>;

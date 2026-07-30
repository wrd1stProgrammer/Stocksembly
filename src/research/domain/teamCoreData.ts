import type { SnapshotDataset } from "../application/buildSnapshot";
import type { WorkflowDepartmentId } from "./roleRegistry";

export type TeamCoreDataContract = {
  readonly datasets: readonly SnapshotDataset[];
  readonly metricIds: readonly string[];
  readonly decisionFrame: string;
};

export const TEAM_CORE_DATA = {
  market: {
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
      "peer_dispersion",
    ],
    decisionFrame:
      "Separate trend, relative strength, expectations, and macro regime. State which observable change would invalidate the market view.",
  },
  company: {
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
      "next_company_event",
    ],
    decisionFrame:
      "Prove the business mechanism: product or segment change, competitive response, and the operating KPI that confirms or breaks the moat.",
  },
  financial: {
    datasets: [
      "sec_company_facts",
      "sec_filing",
      "insightsentry_fundamentals",
      "insightsentry_quote",
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
      "peer_valuation_premium",
    ],
    decisionFrame:
      "Bridge growth to cash generation and valuation. Distinguish reported results, forward expectations, and the margin of safety implied by the current price.",
  },
  risk: {
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
      "recovery_condition",
    ],
    decisionFrame:
      "Build a causal downside path with trigger, transmission, financial impact, buffer, and recovery condition. Do not substitute generic uncertainty language.",
  },
} as const satisfies Readonly<
  Record<WorkflowDepartmentId, TeamCoreDataContract>
>;

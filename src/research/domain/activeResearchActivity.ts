import type { WorkflowActorId } from "./roleRegistry";

export const ACTIVE_RESEARCH_ACTIVITY_KINDS = [
  "data_collection",
  "macro_analysis",
  "news_analysis",
  "market_comparison",
  "business_analysis",
  "product_analysis",
  "competition_analysis",
  "financial_analysis",
  "valuation_analysis",
  "earnings_quality_analysis",
  "downside_analysis",
  "policy_scenario_analysis",
  "team_synthesis",
  "challenge_review",
  "followup_research",
  "response_review",
  "evidence_audit",
  "semantic_audit",
  "chair_synthesis",
] as const;

export type ActiveResearchActivityKind =
  (typeof ACTIVE_RESEARCH_ACTIVITY_KINDS)[number];

export type ActiveResearchActivity = {
  readonly actorId: WorkflowActorId;
  readonly activity: ActiveResearchActivityKind;
};

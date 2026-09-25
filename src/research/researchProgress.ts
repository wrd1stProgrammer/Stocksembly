import type { PublicResearchEvent, PublicRunDetail } from "./client/schemas";
import type { ResearchRunViewState } from "./client/useResearchRun";
import type { ActiveResearchActivityKind } from "./domain/activeResearchActivity";

export const RESEARCH_PROGRESS_STEPS = [
  "prepare",
  "investigate",
  "discuss",
  "audit",
  "publish",
] as const;
export type ResearchProgressStep = (typeof RESEARCH_PROGRESS_STEPS)[number];
export type ResearchProgressStatus =
  | "working"
  | "queued"
  | "reconnecting"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "incomplete"
  | "published";

// Durable milestones, not the delayed office choreography. An accepted memo
// does not finish independent research; consolidation moves into team review.
const eventStage: Readonly<
  Partial<Record<PublicResearchEvent["kind"], number>>
> = {
  run_created: 0,
  collection_started: 0,
  evidence_cutoff_recorded: 0,
  snapshot_sealed: 1,
  mandate_sealed: 1,
  specialist_memo_committed: 1,
  department_consolidation_committed: 2,
  challenge_committed: 2,
  followup_committed: 2,
  owner_response_committed: 2,
  semantic_audit_committed: 3,
  structural_audit_completed: 3,
  gathering_started: 4,
  department_ballot_committed: 4,
  committee_classified: 4,
  chair_synthesis_committed: 4,
  report_published: 4,
};
const activityStage: Readonly<Record<ActiveResearchActivityKind, number>> = {
  data_collection: 0,
  macro_analysis: 1,
  news_analysis: 1,
  market_comparison: 1,
  business_analysis: 1,
  product_analysis: 1,
  competition_analysis: 1,
  financial_analysis: 1,
  valuation_analysis: 1,
  earnings_quality_analysis: 1,
  downside_analysis: 1,
  policy_scenario_analysis: 1,
  team_synthesis: 2,
  challenge_review: 2,
  followup_research: 2,
  response_review: 2,
  evidence_audit: 3,
  semantic_audit: 3,
  chair_synthesis: 4,
};

export function researchProgress(
  snapshot: PublicRunDetail,
  connection: ResearchRunViewState,
) {
  const published =
    snapshot.run.status === "completed" ||
    snapshot.run.status === "complete-with-limitations";
  let index = 0;
  for (const event of snapshot.events)
    index = Math.max(index, eventStage[event.kind] ?? 0);
  for (const active of snapshot.activeActivities ?? [])
    index = Math.max(index, activityStage[active.activity]);
  if (published) index = 4;
  const runStatus = snapshot.run.status;
  const status: ResearchProgressStatus = published
    ? "published"
    : runStatus === "cancelled" ||
        runStatus === "cancelling" ||
        runStatus === "failed" ||
        runStatus === "incomplete"
      ? runStatus
      : [
            "connection-interrupted",
            "degraded",
            "reauthenticating",
            "loading",
          ].includes(connection)
        ? "reconnecting"
        : runStatus === "queued"
          ? "queued"
          : "working";
  return {
    index,
    status,
    step: RESEARCH_PROGRESS_STEPS[index] ?? "prepare",
    published,
  };
}

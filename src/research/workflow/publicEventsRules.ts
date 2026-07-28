import type {
  WorkflowPublicEvent,
  WorkflowPublicEventAuthority,
  WorkflowPublicEventKind,
} from "./publicEventsContracts";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";

export type PublicEventRule = {
  readonly rank: number;
  readonly requiredCount: number;
  readonly maximumCount: number;
  readonly authority: WorkflowPublicEventAuthority;
  readonly phase: WorkflowPublicEvent["phase"];
  readonly bubbleEligible: boolean;
};

type RuleInput = Omit<PublicEventRule, "maximumCount" | "bubbleEligible"> & {
  readonly maximumCount?: number;
  readonly bubbleEligible?: boolean;
};

export const EVENT_RULES = {
  run_created: rule({
    rank: 0,
    requiredCount: 1,
    authority: "system",
    phase: "initialization",
  }),
  collection_started: rule({
    rank: 1,
    requiredCount: 1,
    authority: "system",
    phase: "evidence_collection",
  }),
  evidence_cutoff_recorded: rule({
    rank: 2,
    requiredCount: 1,
    authority: "system",
    phase: "evidence_collection",
  }),
  snapshot_sealed: rule({
    rank: 3,
    requiredCount: 1,
    authority: "system",
    phase: "evidence_collection",
  }),
  mandate_sealed: rule({
    rank: 4,
    requiredCount: 1,
    authority: "system",
    phase: "evidence_collection",
  }),
  specialist_memo_committed: artifactRule({
    rank: 5,
    requiredCount: WORKFLOW_V1_SPECIALIST_IDS.length,
    phase: "evidence_collection",
  }),
  department_consolidation_committed: artifactRule({
    rank: 6,
    requiredCount: 4,
    phase: "department_review",
  }),
  challenge_committed: artifactRule({
    rank: 7,
    requiredCount: 4,
    phase: "challenge",
  }),
  followup_committed: artifactRule({
    rank: 8,
    requiredCount: 0,
    maximumCount: 3,
    phase: "challenge",
  }),
  owner_response_committed: artifactRule({
    rank: 9,
    requiredCount: 4,
    phase: "challenge",
  }),
  structural_audit_completed: rule({
    rank: 10,
    requiredCount: 1,
    authority: "system",
    phase: "audit",
  }),
  semantic_audit_committed: artifactRule({
    rank: 11,
    requiredCount: 1,
    phase: "audit",
    bubbleEligible: false,
  }),
  gathering_started: rule({
    rank: 12,
    requiredCount: 1,
    authority: "system",
    phase: "committee",
  }),
  department_ballot_committed: artifactRule({
    rank: 13,
    requiredCount: 4,
    phase: "committee",
  }),
  committee_classified: rule({
    rank: 14,
    requiredCount: 1,
    authority: "system",
    phase: "committee",
  }),
  chair_synthesis_committed: artifactRule({
    rank: 15,
    requiredCount: 1,
    phase: "synthesis",
  }),
  runtime_status: rule({
    rank: 15,
    requiredCount: 0,
    maximumCount: 100,
    authority: "system",
    phase: "synthesis",
  }),
  report_published: rule({
    rank: 16,
    requiredCount: 1,
    authority: "atomic_report_publication",
    phase: "publication",
  }),
  run_incomplete: terminalRule(),
  run_failed: terminalRule(),
  run_cancelling: terminalRule(),
  run_cancelled: terminalRule(),
} as const satisfies Record<WorkflowPublicEventKind, PublicEventRule>;

export const TERMINAL_EVENT_KINDS = new Set<WorkflowPublicEventKind>([
  "report_published",
  "run_incomplete",
  "run_failed",
  "run_cancelled",
]);

function artifactRule(input: Omit<RuleInput, "authority">): PublicEventRule {
  return rule({
    ...input,
    authority: "trusted_artifact_commit",
    bubbleEligible: input.bubbleEligible ?? true,
  });
}

function rule(input: RuleInput): PublicEventRule {
  return {
    ...input,
    maximumCount: input.maximumCount ?? input.requiredCount,
    bubbleEligible: input.bubbleEligible ?? false,
  };
}

function terminalRule(): PublicEventRule {
  return rule({
    rank: 100,
    requiredCount: 0,
    maximumCount: 1,
    authority: "system",
    phase: "terminal",
  });
}

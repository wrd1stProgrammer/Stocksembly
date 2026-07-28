export type WorkflowV1SystemEventKind =
  | "run_created"
  | "collection_started"
  | "evidence_cutoff_recorded"
  | "snapshot_sealed"
  | "mandate_sealed"
  | "structural_audit_completed"
  | "gathering_started"
  | "committee_classified";

export type WorkflowV1ArtifactEventKind =
  | "specialist_memo_committed"
  | "department_consolidation_committed"
  | "challenge_committed"
  | "followup_committed"
  | "owner_response_committed"
  | "department_ballot_committed"
  | "semantic_audit_committed"
  | "chair_synthesis_committed";

export const WORKFLOW_V1_MAX_ACCEPTED_SOURCES = 64 as const;

type LedgerBase = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly sequence: number;
};

export type WorkflowV1LedgerEntry = LedgerBase &
  (
    | {
        readonly type: "system_event";
        readonly eventKind: WorkflowV1SystemEventKind;
      }
    | {
        readonly type: "source_accepted";
        readonly sourceId: string;
        readonly artifactId: string;
        readonly capabilityId: string;
      }
    | { readonly type: "collection_completed" }
    | {
        readonly type: "followups_planned";
        readonly logicalArtifactIds: readonly string[];
      }
    | {
        readonly type: "launch_reserved";
        readonly ordinal: number;
        readonly logicalArtifactId: string;
      }
    | {
        readonly type: "launch_finished";
        readonly ordinal: number;
        readonly logicalArtifactId: string;
        readonly outcome:
          | "invalid_schema"
          | "process_crash"
          | "timeout"
          | "lost"
          | "uncertain"
          | "cancelled_race"
          | "other_not_accepted";
      }
    | {
        readonly type: "artifact_event_committed";
        readonly ordinal: number;
        readonly logicalArtifactId: string;
        readonly artifactId: string;
        readonly actorId: string;
        readonly eventKinds: readonly WorkflowV1ArtifactEventKind[];
      }
    | {
        readonly type: "ballot_event_projected";
        readonly logicalArtifactId: string;
        readonly artifactId: string;
        readonly actorId: string;
      }
    | { readonly type: "cancel_requested"; readonly intentId: string }
    | {
        readonly type: "failure_requested";
        readonly intentId: string;
        readonly reason: string;
      }
    | { readonly type: "run_cancelled" }
    | { readonly type: "run_failed"; readonly reason: string }
    | { readonly type: "run_incomplete"; readonly reason: string }
    | {
        readonly type: "report_ready";
        readonly reportId: string;
        readonly reportVersionId: string;
        readonly reportArtifactId: string;
        readonly chairArtifactId: string;
      }
    | {
        readonly type: "report_event_committed";
        readonly reportId: string;
        readonly reportVersionId: string;
        readonly reportArtifactId: string;
        readonly chairArtifactId: string;
        readonly metadataCommitted: true;
      }
  );

export type WorkflowV1ReportReadyEntry = Extract<
  WorkflowV1LedgerEntry,
  { readonly type: "report_ready" }
>;

export type WorkflowV1Phase =
  | "new"
  | "created"
  | "collecting"
  | "collection_closed"
  | "cutoff_recorded"
  | "snapshot_sealed"
  | "mandate_sealed"
  | "specialist_round"
  | "department_round"
  | "challenge_round"
  | "followup_round"
  | "response_round"
  | "structural_audit"
  | "semantic_audit"
  | "committee"
  | "chair_synthesis"
  | "publishing"
  | "published"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "incomplete";

export type WorkflowV1InvalidReason =
  | "sequence_invalid"
  | "cross_run_entry"
  | "cross_snapshot_entry"
  | "event_order_invalid"
  | "fetch_after_cutoff"
  | "ordinal_invalid"
  | "ordinal_reused"
  | "physical_limit_exceeded"
  | "unexpected_artifact"
  | "actor_ownership_mismatch"
  | "artifact_event_mismatch"
  | "commit_without_reservation"
  | "launch_outcome_mismatch"
  | "artifact_repeated"
  | "replacement_repeated"
  | "replacement_limit_exceeded"
  | "followup_plan_invalid"
  | "ballot_projection_invalid"
  | "report_binding_invalid"
  | "source_identity_invalid"
  | "source_identity_repeated"
  | "source_limit_exceeded"
  | "terminal_intent_invalid"
  | "terminal_intent_conflict"
  | "terminal_intent_fenced"
  | "entry_after_terminal";

export type WorkflowV1LaunchState = {
  readonly ordinal: number;
  readonly logicalArtifactId: string;
  readonly status: "reserved" | "accepted" | "failed";
  readonly outcome?:
    | "invalid_schema"
    | "process_crash"
    | "timeout"
    | "lost"
    | "uncertain"
    | "cancelled_race"
    | "other_not_accepted";
};

export type WorkflowV1ValidState = {
  readonly kind: "valid";
  readonly phase: WorkflowV1Phase;
  readonly terminal: boolean;
  readonly recoverable: boolean;
  readonly acceptedArtifactCount: number;
  readonly physicalLaunchCount: number;
  readonly acceptedSourceCount: number;
  readonly requiredReplacementCount: number;
  readonly burnedOrdinals: readonly number[];
  readonly acceptedLogicalArtifactIds: readonly string[];
  readonly launches: readonly WorkflowV1LaunchState[];
  readonly pendingReservations: readonly WorkflowV1LaunchState[];
  readonly cancellationRequested: boolean;
  readonly cancellationIntentId: string | null;
  readonly failureRequestedReason: string | null;
  readonly failureIntentId: string | null;
  readonly followupsPlanned: readonly string[] | null;
  readonly failedLogicalArtifactIds: readonly string[];
  readonly projectedBallotArtifactIds: readonly string[];
};

export type WorkflowV1State =
  | WorkflowV1ValidState
  | {
      readonly kind: "invalid";
      readonly reason: WorkflowV1InvalidReason;
      readonly sequence: number;
    };

export type WorkflowV1Replay = {
  readonly state: WorkflowV1ValidState;
  readonly milestones: ReadonlySet<WorkflowV1SystemEventKind>;
  readonly collectionCompleted: boolean;
};

export type WorkflowV1NextAction =
  | {
      readonly kind: "emit_system_event";
      readonly eventKind: WorkflowV1SystemEventKind;
    }
  | { readonly kind: "collect_evidence" }
  | { readonly kind: "close_collection" }
  | { readonly kind: "plan_followups" }
  | {
      readonly kind: "stage_artifacts";
      readonly logicalArtifactIds: readonly string[];
      readonly nextOrdinal: number;
      readonly purpose:
        | "mandatory_first"
        | "optional_followup"
        | "required_replacement";
    }
  | {
      readonly kind: "record_reserved_launch_failure";
      readonly logicalArtifactId: string;
      readonly ordinal: number;
      readonly outcome: "uncertain" | "cancelled_race";
    }
  | { readonly kind: "run_structural_audit" }
  | {
      readonly kind: "project_ballots";
      readonly logicalArtifactIds: readonly string[];
    }
  | { readonly kind: "publish_report" }
  | { readonly kind: "finalize_cancel" }
  | { readonly kind: "finalize_failure"; readonly reason: string }
  | { readonly kind: "mark_incomplete"; readonly reason: string }
  | {
      readonly kind: "invalid_ledger";
      readonly reason: WorkflowV1InvalidReason;
    }
  | { readonly kind: "none" };

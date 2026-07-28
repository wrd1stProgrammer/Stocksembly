import type {
  WorkflowPublicEvent,
  WorkflowPublicEventKind,
} from "./publicEventsContracts";

export type WorkflowProgress = {
  readonly step: 1 | 2 | 3 | 4 | 5;
  readonly completedSteps: 0 | 1 | 2 | 3 | 4 | 5;
};

const PROGRESS_BY_EVENT: Partial<
  Record<WorkflowPublicEventKind, WorkflowProgress>
> = {
  mandate_sealed: { step: 2, completedSteps: 1 },
  specialist_memo_committed: { step: 2, completedSteps: 1 },
  department_consolidation_committed: { step: 2, completedSteps: 1 },
  challenge_committed: { step: 3, completedSteps: 2 },
  followup_committed: { step: 3, completedSteps: 2 },
  owner_response_committed: { step: 3, completedSteps: 2 },
  department_ballot_committed: { step: 3, completedSteps: 2 },
  structural_audit_completed: { step: 3, completedSteps: 2 },
  semantic_audit_committed: { step: 3, completedSteps: 2 },
  gathering_started: { step: 4, completedSteps: 3 },
  committee_classified: { step: 4, completedSteps: 3 },
  chair_synthesis_committed: { step: 5, completedSteps: 4 },
  report_published: { step: 5, completedSteps: 5 },
};

export function workflowProgressFromEvents(
  events: readonly WorkflowPublicEvent[],
): WorkflowProgress {
  let progress: WorkflowProgress = { step: 1, completedSteps: 0 };
  for (const event of events) {
    const candidate = PROGRESS_BY_EVENT[event.kind];
    if (
      candidate !== undefined &&
      candidate.completedSteps > progress.completedSteps
    )
      progress = candidate;
  }
  return progress;
}

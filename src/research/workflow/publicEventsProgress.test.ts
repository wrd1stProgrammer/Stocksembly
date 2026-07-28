import { describe, expect, it } from "vitest";
import {
  type WorkflowPublicEvent,
  type WorkflowPublicEventKind,
  workflowProgressFromEvents,
} from "./publicEvents";

function committed(
  kind: WorkflowPublicEventKind,
  sequence: number,
): WorkflowPublicEvent {
  return {
    schemaVersion: "workflow-v1",
    eventId: `${sequence.toString().padStart(8, "0")}-0000-4000-8000-000000000004`,
    runId: "10000000-0000-4000-8000-000000000001",
    snapshotId: "20000000-0000-4000-8000-000000000002",
    sequence,
    kind,
    phase: "initialization",
    occurredAt: "2026-07-23T00:00:00.000Z",
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
    summary: { en: kind, ko: kind },
    bubbleEligible: false,
  };
}

describe("durable WorkflowV1 five-step progress", () => {
  it.each([
    ["run_created", 1, 0],
    ["mandate_sealed", 2, 1],
    ["specialist_memo_committed", 2, 1],
    ["challenge_committed", 3, 2],
    ["semantic_audit_committed", 3, 2],
    ["gathering_started", 4, 3],
    ["committee_classified", 4, 3],
    ["chair_synthesis_committed", 5, 4],
    ["report_published", 5, 5],
  ] as const)("maps %s to step %i", (kind, step, completedSteps) => {
    const events = [committed("run_created", 1), committed(kind, 2)];
    expect(workflowProgressFromEvents(events)).toEqual({
      step,
      completedSteps,
    });
  });

  it("keeps incomplete runs at their highest committed phase", () => {
    const events = [
      committed("run_created", 1),
      committed("challenge_committed", 2),
      committed("run_incomplete", 3),
    ];
    expect(workflowProgressFromEvents(events)).toEqual({
      step: 3,
      completedSteps: 2,
    });
  });

  it("does not advance without a committed phase event", () => {
    expect(workflowProgressFromEvents([committed("run_created", 1)])).toEqual({
      step: 1,
      completedSteps: 0,
    });
  });
});

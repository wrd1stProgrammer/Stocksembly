import { describe, expect, it } from "vitest";
import {
  deriveWorkflowV1State,
  nextWorkflowV1Action,
  WORKFLOW_V1_MAX_ACCEPTED_SOURCES,
  type WorkflowV1LedgerEntry,
} from "./workflowV1";

const RUN = "10000000-0000-4000-8000-000000000001";
const SNAPSHOT = "20000000-0000-4000-8000-000000000002";
const REPORT = "70000000-0000-4000-8000-000000000007";
const REPORT_VERSION = "80000000-0000-4000-8000-000000000008";
const REPORT_ARTIFACT = "90000000-0000-4000-8000-000000000009";
const CANCEL_INTENT = "a1000000-0000-4000-8000-000000000010";
const FAILURE_INTENT = "a2000000-0000-4000-8000-000000000011";

function artifactId(logicalArtifactId: string): string {
  const hash = [...logicalArtifactId].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) % 0xffffffffff,
    1,
  );
  return `30000000-0000-4000-8000-${hash.toString(16).padStart(12, "0")}`;
}
type EntryValue = WorkflowV1LedgerEntry extends infer Entry
  ? Entry extends {
      readonly runId: string;
      readonly snapshotId: string;
      readonly sequence: number;
    }
    ? Omit<Entry, "runId" | "snapshotId" | "sequence">
    : never
  : never;

function entry(sequence: number, value: EntryValue): WorkflowV1LedgerEntry {
  return { runId: RUN, snapshotId: SNAPSHOT, sequence, ...value };
}

function system(
  events: readonly WorkflowV1LedgerEntry[],
  eventKind:
    | "run_created"
    | "collection_started"
    | "evidence_cutoff_recorded"
    | "snapshot_sealed"
    | "mandate_sealed"
    | "structural_audit_completed"
    | "gathering_started"
    | "committee_classified",
): readonly WorkflowV1LedgerEntry[] {
  return [
    ...events,
    entry(events.length + 1, { type: "system_event", eventKind }),
  ];
}

function accept(
  events: readonly WorkflowV1LedgerEntry[],
  ordinal: number,
  logicalArtifactId: string,
  actorId: string,
  eventKinds: readonly (
    | "specialist_memo_committed"
    | "department_consolidation_committed"
    | "challenge_committed"
    | "followup_committed"
    | "owner_response_committed"
    | "department_ballot_committed"
    | "semantic_audit_committed"
    | "chair_synthesis_committed"
  )[],
): readonly WorkflowV1LedgerEntry[] {
  const reserved = [
    ...events,
    entry(events.length + 1, {
      type: "launch_reserved",
      ordinal,
      logicalArtifactId,
    }),
  ];
  return [
    ...reserved,
    entry(reserved.length + 1, {
      type: "artifact_event_committed",
      ordinal,
      logicalArtifactId,
      artifactId: artifactId(logicalArtifactId),
      actorId,
      eventKinds,
    }),
  ];
}

function fail(
  events: readonly WorkflowV1LedgerEntry[],
  ordinal: number,
  logicalArtifactId: string,
): readonly WorkflowV1LedgerEntry[] {
  return [
    ...events,
    entry(events.length + 1, {
      type: "launch_reserved",
      ordinal,
      logicalArtifactId,
    }),
    entry(events.length + 2, {
      type: "launch_finished",
      ordinal,
      logicalArtifactId,
      outcome: "process_crash",
    }),
  ];
}

function throughMandate(): readonly WorkflowV1LedgerEntry[] {
  let events: readonly WorkflowV1LedgerEntry[] = [];
  events = system(events, "run_created");
  events = system(events, "collection_started");
  events = [...events, entry(3, { type: "collection_completed" })];
  events = system(events, "evidence_cutoff_recorded");
  events = system(events, "snapshot_sealed");
  return system(events, "mandate_sealed");
}

const REQUIRED = [
  ...[
    "market",
    "market_news",
    "company",
    "company_product",
    "company_competition",
    "financial",
    "valuation",
    "financial_quality",
    "risk",
    "risk_policy",
  ].map((actorId) => ({
    id: `memo:${actorId}`,
    actorId,
    events: ["specialist_memo_committed"] as const,
  })),
  ...["market", "company", "financial", "risk"].map((actorId) => ({
    id: `consolidation:${actorId}`,
    actorId,
    events: ["department_consolidation_committed"] as const,
  })),
  ...["market", "company", "financial", "risk"].map((actorId) => ({
    id: `challenge:${actorId}`,
    actorId,
    events: ["challenge_committed"] as const,
  })),
  ...["market", "company", "financial", "risk"].map((actorId) => ({
    id: `response_ballot:${actorId}`,
    actorId,
    events: ["owner_response_committed"] as const,
  })),
] as const;

describe("WorkflowV1 durable coordinator", () => {
  it("replays the exact durable stage order and publishes only after the chair", () => {
    // Given
    let events = throughMandate();
    let ordinal = 1;
    for (const slot of REQUIRED) {
      if (slot.id === "response_ballot:market")
        events = [
          ...events,
          entry(events.length + 1, {
            type: "followups_planned",
            logicalArtifactIds: [],
          }),
        ];
      events = accept(events, ordinal++, slot.id, slot.actorId, slot.events);
    }
    events = system(events, "structural_audit_completed");
    events = accept(events, ordinal++, "semantic_audit:system", "system", [
      "semantic_audit_committed",
    ]);
    events = system(events, "gathering_started");
    for (const actorId of ["market", "company", "financial", "risk"])
      events = [
        ...events,
        entry(events.length + 1, {
          type: "ballot_event_projected",
          logicalArtifactId: `response_ballot:${actorId}`,
          artifactId: artifactId(`response_ballot:${actorId}`),
          actorId,
        }),
      ];
    events = system(events, "committee_classified");
    events = accept(events, ordinal++, "chair_synthesis:chair", "chair", [
      "chair_synthesis_committed",
    ]);

    // When
    const beforePublication = deriveWorkflowV1State(events);
    const action = nextWorkflowV1Action(events);
    const ready = [
      ...events,
      entry(events.length + 1, {
        type: "report_ready",
        reportId: REPORT,
        reportVersionId: REPORT_VERSION,
        reportArtifactId: REPORT_ARTIFACT,
        chairArtifactId: artifactId("chair_synthesis:chair"),
      }),
    ];
    const published = [
      ...ready,
      entry(ready.length + 1, {
        type: "report_event_committed",
        reportId: REPORT,
        reportVersionId: REPORT_VERSION,
        reportArtifactId: REPORT_ARTIFACT,
        chairArtifactId: artifactId("chair_synthesis:chair"),
        metadataCommitted: true,
      }),
    ];

    // Then
    expect(beforePublication).toMatchObject({
      kind: "valid",
      phase: "publishing",
      acceptedArtifactCount: 24,
      physicalLaunchCount: 24,
    });
    expect(action).toEqual({ kind: "publish_report" });
    expect(deriveWorkflowV1State(published)).toMatchObject({
      kind: "valid",
      phase: "published",
      terminal: true,
    });
    expect(nextWorkflowV1Action(published)).toEqual({ kind: "none" });
    expect(
      deriveWorkflowV1State([
        ...ready,
        entry(ready.length + 1, {
          type: "report_event_committed",
          reportId: "arbitrary",
          reportVersionId: REPORT_VERSION,
          reportArtifactId: REPORT_ARTIFACT,
          chairArtifactId: artifactId("chair_synthesis:chair"),
          metadataCommitted: true,
        }),
      ]),
    ).toMatchObject({ kind: "invalid", reason: "report_binding_invalid" });
  });

  it("rejects out-of-order, cross-run, fetch-after-cutoff, and unreserved commits", () => {
    // Given
    const mandateFirst = [
      entry(1, { type: "system_event", eventKind: "run_created" }),
      entry(2, { type: "system_event", eventKind: "mandate_sealed" }),
    ];
    const crossRun = [
      entry(1, { type: "system_event", eventKind: "run_created" }),
      {
        ...entry(2, { type: "system_event", eventKind: "collection_started" }),
        runId: "other",
      },
    ];
    const afterCutoff = [
      ...throughMandate(),
      entry(7, {
        type: "source_accepted",
        sourceId: "a0000000-0000-4000-8000-000000000001",
        artifactId: "b0000000-0000-4000-8000-000000000001",
        capabilityId: "cap:late",
      }),
    ];
    const unreserved = [
      ...throughMandate(),
      entry(7, {
        type: "artifact_event_committed",
        ordinal: 1,
        logicalArtifactId: "memo:market",
        artifactId: "artifact:memo:market",
        actorId: "market",
        eventKinds: ["specialist_memo_committed"],
      }),
    ];

    // When / Then
    expect(deriveWorkflowV1State(mandateFirst)).toMatchObject({
      kind: "invalid",
      reason: "event_order_invalid",
    });
    expect(deriveWorkflowV1State(crossRun)).toMatchObject({
      kind: "invalid",
      reason: "cross_run_entry",
    });
    expect(deriveWorkflowV1State(afterCutoff)).toMatchObject({
      kind: "invalid",
      reason: "fetch_after_cutoff",
    });
    expect(deriveWorkflowV1State(unreserved)).toMatchObject({
      kind: "invalid",
      reason: "commit_without_reservation",
    });
  });

  it("requires all four code-owned ballot projections before committee classification", () => {
    // Given
    let events = throughMandate();
    let ordinal = 1;
    for (const slot of REQUIRED) {
      if (slot.id === "response_ballot:market")
        events = [
          ...events,
          entry(events.length + 1, {
            type: "followups_planned",
            logicalArtifactIds: [],
          }),
        ];
      events = accept(events, ordinal++, slot.id, slot.actorId, slot.events);
    }
    events = system(events, "structural_audit_completed");
    events = accept(events, ordinal, "semantic_audit:system", "system", [
      "semantic_audit_committed",
    ]);
    events = system(events, "gathering_started");
    for (const actorId of ["market", "company", "financial"])
      events = [
        ...events,
        entry(events.length + 1, {
          type: "ballot_event_projected",
          logicalArtifactId: `response_ballot:${actorId}`,
          artifactId: artifactId(`response_ballot:${actorId}`),
          actorId,
        }),
      ];

    // When
    const action = nextWorkflowV1Action(events);
    const premature = system(events, "committee_classified");

    // Then
    expect(action).toEqual({
      kind: "project_ballots",
      logicalArtifactIds: ["response_ballot:risk"],
    });
    expect(deriveWorkflowV1State(premature)).toMatchObject({
      kind: "invalid",
      reason: "event_order_invalid",
    });
  });

  it("recovers an uncertain reservation with a burned ordinal and never relaunches it", () => {
    // Given
    const events = [
      ...throughMandate(),
      entry(7, {
        type: "launch_reserved",
        ordinal: 1,
        logicalArtifactId: "memo:market",
      }),
    ];

    // When
    const recovery = nextWorkflowV1Action(events);
    const burned = [
      ...events,
      entry(8, {
        type: "launch_finished",
        ordinal: 1,
        logicalArtifactId: "memo:market",
        outcome: "uncertain",
      }),
    ];

    // Then
    expect(recovery).toEqual({
      kind: "record_reserved_launch_failure",
      logicalArtifactId: "memo:market",
      ordinal: 1,
      outcome: "uncertain",
    });
    expect(nextWorkflowV1Action(burned)).toEqual({
      kind: "stage_artifacts",
      logicalArtifactIds: ["memo:market"],
      nextOrdinal: 2,
      purpose: "required_replacement",
    });
    expect(deriveWorkflowV1State(burned)).toMatchObject({
      kind: "valid",
      burnedOrdinals: [1],
      recoverable: true,
      terminal: false,
    });
  });

  it("accepts concurrent reservations within one stage and recovers each ordinal", () => {
    // Given
    const events = [
      ...throughMandate(),
      entry(7, {
        type: "launch_reserved",
        ordinal: 1,
        logicalArtifactId: "memo:market",
      }),
      entry(8, {
        type: "launch_reserved",
        ordinal: 2,
        logicalArtifactId: "memo:market_news",
      }),
      entry(9, {
        type: "launch_reserved",
        ordinal: 3,
        logicalArtifactId: "memo:company",
      }),
    ];

    // When
    const state = deriveWorkflowV1State(events);
    const action = nextWorkflowV1Action(events);

    // Then
    expect(state).toMatchObject({
      kind: "valid",
      physicalLaunchCount: 3,
      pendingReservations: [
        { ordinal: 1, status: "reserved" },
        { ordinal: 2, status: "reserved" },
        { ordinal: 3, status: "reserved" },
      ],
    });
    expect(action).toEqual({
      kind: "record_reserved_launch_failure",
      logicalArtifactId: "memo:market",
      ordinal: 1,
      outcome: "uncertain",
    });
  });

  it("does not replace a failed optional follow-up and advances to owner responses", () => {
    // Given
    let events = throughMandate();
    let ordinal = 1;
    for (const slot of REQUIRED.slice(0, 18))
      events = accept(events, ordinal++, slot.id, slot.actorId, slot.events);
    events = [
      ...events,
      entry(events.length + 1, {
        type: "followups_planned",
        logicalArtifactIds: ["followup:market_news"],
      }),
      entry(events.length + 2, {
        type: "launch_reserved",
        ordinal,
        logicalArtifactId: "followup:market_news",
      }),
      entry(events.length + 3, {
        type: "launch_finished",
        ordinal,
        logicalArtifactId: "followup:market_news",
        outcome: "process_crash",
      }),
    ];

    // When
    const action = nextWorkflowV1Action(events);

    // Then
    expect(action).toEqual({
      kind: "stage_artifacts",
      logicalArtifactIds: [
        "response_ballot:market",
        "response_ballot:company",
        "response_ballot:financial",
        "response_ballot:risk",
      ],
      nextOrdinal: 20,
      purpose: "mandatory_first",
    });
    expect(deriveWorkflowV1State(events)).toMatchObject({
      kind: "valid",
      burnedOrdinals: [19],
      recoverable: true,
    });
  });

  it("marks the run incomplete instead of reserving a fourth replacement", () => {
    // Given
    let events = throughMandate();
    let ordinal = 1;
    for (const slot of REQUIRED.slice(0, 3)) {
      events = fail(events, ordinal++, slot.id);
      events = accept(events, ordinal++, slot.id, slot.actorId, slot.events);
    }
    events = fail(events, ordinal, "memo:company_product");

    // When
    const action = nextWorkflowV1Action(events);

    // Then
    expect(deriveWorkflowV1State(events)).toMatchObject({
      kind: "valid",
      requiredReplacementCount: 3,
      burnedOrdinals: [1, 3, 5, 7],
    });
    expect(action).toEqual({
      kind: "mark_incomplete",
      reason: "replacement_exhausted",
    });
  });

  it("cancellation burns an outstanding reservation before a durable terminal", () => {
    // Given
    const active = [
      ...throughMandate(),
      entry(7, {
        type: "launch_reserved",
        ordinal: 1,
        logicalArtifactId: "memo:market",
      }),
      entry(8, { type: "cancel_requested", intentId: CANCEL_INTENT }),
    ];

    // When / Then
    expect(nextWorkflowV1Action(active)).toEqual({
      kind: "record_reserved_launch_failure",
      logicalArtifactId: "memo:market",
      ordinal: 1,
      outcome: "cancelled_race",
    });
    const burned = [
      ...active,
      entry(9, {
        type: "launch_finished",
        ordinal: 1,
        logicalArtifactId: "memo:market",
        outcome: "cancelled_race",
      }),
    ];
    expect(nextWorkflowV1Action(burned)).toEqual({ kind: "finalize_cancel" });
    expect(
      deriveWorkflowV1State([...burned, entry(10, { type: "run_cancelled" })]),
    ).toMatchObject({
      kind: "valid",
      phase: "cancelled",
      terminal: true,
      burnedOrdinals: [1],
    });
  });

  it("terminalizes a requested durable failure only after reservations drain", () => {
    // Given
    const requested = [
      ...throughMandate(),
      entry(7, {
        type: "failure_requested",
        intentId: FAILURE_INTENT,
        reason: "worker_unavailable",
      }),
    ];

    // When
    const action = nextWorkflowV1Action(requested);
    const duplicate = [
      ...requested,
      entry(8, {
        type: "failure_requested",
        intentId: FAILURE_INTENT,
        reason: "worker_unavailable",
      }),
    ];
    const failed = [
      ...duplicate,
      entry(9, { type: "run_failed", reason: "worker_unavailable" }),
    ];

    // Then
    expect(action).toEqual({
      kind: "finalize_failure",
      reason: "worker_unavailable",
    });
    expect(nextWorkflowV1Action(duplicate)).toEqual({
      kind: "finalize_failure",
      reason: "worker_unavailable",
    });
    expect(deriveWorkflowV1State(failed)).toMatchObject({
      kind: "valid",
      phase: "failed",
      terminal: true,
    });
    expect(
      deriveWorkflowV1State([
        ...failed,
        entry(10, {
          type: "source_accepted",
          sourceId: "a0000000-0000-4000-8000-000000000001",
          artifactId: "b0000000-0000-4000-8000-000000000001",
          capabilityId: "cap:late",
        }),
      ]),
    ).toMatchObject({ kind: "invalid", reason: "entry_after_terminal" });
  });

  it("admits only unique bounded source identities during collection", () => {
    // Given
    let events: readonly WorkflowV1LedgerEntry[] = [];
    events = system(events, "run_created");
    events = system(events, "collection_started");
    for (let index = 0; index < WORKFLOW_V1_MAX_ACCEPTED_SOURCES; index += 1)
      events = [
        ...events,
        entry(events.length + 1, {
          type: "source_accepted",
          sourceId: `a0000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          artifactId: `b0000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          capabilityId: `cap:source_${index}`,
        }),
      ];

    // When
    const duplicate = [
      ...events,
      entry(events.length + 1, {
        type: "source_accepted",
        sourceId: "a0000000-0000-4000-8000-000000000000",
        artifactId: "c0000000-0000-4000-8000-000000000001",
        capabilityId: "cap:duplicate",
      }),
    ];
    const overflow = [
      ...events,
      entry(events.length + 1, {
        type: "source_accepted",
        sourceId: "c0000000-0000-4000-8000-000000000001",
        artifactId: "d0000000-0000-4000-8000-000000000001",
        capabilityId: "cap:overflow",
      }),
    ];

    // Then
    expect(deriveWorkflowV1State(events)).toMatchObject({ kind: "valid" });
    expect(deriveWorkflowV1State(duplicate)).toMatchObject({
      kind: "invalid",
      reason: "source_identity_repeated",
    });
    expect(deriveWorkflowV1State(overflow)).toMatchObject({
      kind: "invalid",
      reason: "source_limit_exceeded",
    });
  });

  it("allows distinct sources to share one capability class", () => {
    // Given
    let events: readonly WorkflowV1LedgerEntry[] = [];
    events = system(events, "run_created");
    events = system(events, "collection_started");
    for (let index = 1; index <= 2; index += 1)
      events = [
        ...events,
        entry(events.length + 1, {
          type: "source_accepted",
          sourceId: `a0000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          artifactId: `b0000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          capabilityId: "cap:sec_filings",
        }),
      ];

    // When
    const state = deriveWorkflowV1State(events);

    // Then
    expect(state).toMatchObject({ kind: "valid", acceptedSourceCount: 2 });
  });

  it.each([
    [
      "cancel to failure",
      { type: "cancel_requested", intentId: CANCEL_INTENT } as const,
      {
        type: "failure_requested",
        intentId: FAILURE_INTENT,
        reason: "worker_unavailable",
      } as const,
    ],
    [
      "failure to cancel",
      {
        type: "failure_requested",
        intentId: FAILURE_INTENT,
        reason: "worker_unavailable",
      } as const,
      { type: "cancel_requested", intentId: CANCEL_INTENT } as const,
    ],
  ])("rejects conflicting terminal intent: %s", (_name, first, second) => {
    // Given
    const intended = [...throughMandate(), entry(7, first)];

    // When
    const result = deriveWorkflowV1State([...intended, entry(8, second)]);

    // Then
    expect(result).toMatchObject({
      kind: "invalid",
      reason: "terminal_intent_conflict",
    });
  });

  it("fences progress after terminal intent and replays only its exact duplicate", () => {
    // Given
    const intended = [
      ...throughMandate(),
      entry(7, { type: "cancel_requested", intentId: CANCEL_INTENT }),
    ];
    const duplicate = [
      ...intended,
      entry(8, { type: "cancel_requested", intentId: CANCEL_INTENT }),
    ];

    // When
    const reservedAfterIntent = [
      ...intended,
      entry(8, {
        type: "launch_reserved",
        ordinal: 1,
        logicalArtifactId: "memo:market",
      }),
    ];
    const differentDuplicate = [
      ...intended,
      entry(8, {
        type: "cancel_requested",
        intentId: "a3000000-0000-4000-8000-000000000012",
      }),
    ];
    const pendingThenIntended = [
      ...throughMandate(),
      entry(7, {
        type: "launch_reserved",
        ordinal: 1,
        logicalArtifactId: "memo:market",
      }),
      entry(8, { type: "cancel_requested", intentId: CANCEL_INTENT }),
    ];
    const acceptedAfterIntent = [
      ...pendingThenIntended,
      entry(9, {
        type: "artifact_event_committed",
        ordinal: 1,
        logicalArtifactId: "memo:market",
        artifactId: artifactId("memo:market"),
        actorId: "market",
        eventKinds: ["specialist_memo_committed"],
      }),
    ];

    // Then
    expect(deriveWorkflowV1State(duplicate)).toMatchObject({
      kind: "valid",
      phase: "cancelling",
    });
    expect(deriveWorkflowV1State(reservedAfterIntent)).toMatchObject({
      kind: "invalid",
      reason: "terminal_intent_fenced",
    });
    expect(deriveWorkflowV1State(differentDuplicate)).toMatchObject({
      kind: "invalid",
      reason: "terminal_intent_conflict",
    });
    expect(deriveWorkflowV1State(acceptedAfterIntent)).toMatchObject({
      kind: "invalid",
      reason: "terminal_intent_fenced",
    });
    expect(nextWorkflowV1Action(duplicate)).toEqual({
      kind: "finalize_cancel",
    });
  });
});

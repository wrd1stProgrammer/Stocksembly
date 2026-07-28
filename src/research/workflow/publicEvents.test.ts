import { describe, expect, it } from "vitest";
import { AgentOutputCandidateSchema } from "../domain/agentOutputs";
import {
  appendWorkflowPublicEvent,
  parseWorkflowPublicEvent,
  publicArtifactEventFields,
  type WorkflowEventDraft,
  type WorkflowPublicEvent,
} from "./publicEvents";

const ids = {
  run: "10000000-0000-4000-8000-000000000001",
  snapshot: "20000000-0000-4000-8000-000000000002",
  artifact: "30000000-0000-4000-8000-000000000003",
  event: "40000000-0000-4000-8000-000000000004",
  claim: "50000000-0000-4000-8000-000000000005",
  source: "60000000-0000-4000-8000-000000000006",
} as const;

function draft(
  kind: WorkflowEventDraft["kind"],
  sequence: number,
  overrides: Partial<WorkflowEventDraft> = {},
): WorkflowEventDraft {
  return {
    eventId: `${sequence.toString().padStart(8, "0")}-0000-4000-8000-000000000004`,
    runId: ids.run,
    snapshotId: ids.snapshot,
    sequence,
    kind,
    occurredAt: "2026-07-23T00:00:00.000Z",
    participantIds: [],
    claimIds: [],
    sourceIds: [],
    limitationIds: [],
    summary: { en: kind, ko: kind },
    ...overrides,
  };
}

function append(
  events: readonly WorkflowPublicEvent[],
  event: WorkflowEventDraft,
  authority: "system" | "trusted_artifact_commit" = "system",
): readonly WorkflowPublicEvent[] {
  const result = appendWorkflowPublicEvent(events, event, authority);
  expect(result.ok).toBe(true);
  return result.ok ? [...events, result.event] : events;
}

function durableHistory(
  kinds: readonly WorkflowEventDraft["kind"][],
): readonly WorkflowPublicEvent[] {
  return kinds.map((kind, index) => ({
    schemaVersion: "workflow-v1",
    ...draft(kind, index + 1),
    phase: "initialization",
    bubbleEligible: false,
  }));
}

describe("WorkflowV1 public events", () => {
  it("derives a public memo payload from allowlisted bilingual fields", () => {
    const fields = publicArtifactEventFields(
      AgentOutputCandidateSchema.parse({
        kind: "memo",
        sourceArtifactIds: [ids.source],
        positions: [
          {
            claimId: ids.claim,
            stance: "supports",
            publicSummary: {
              en: "Revenue improved.",
              ko: "매출이 개선됐습니다.",
            },
            evidenceArtifactIds: [ids.source],
          },
        ],
        dissent: [],
        unknowns: [],
      }),
    );
    expect(fields).toEqual({
      summary: { en: "Revenue improved.", ko: "매출이 개선됐습니다." },
      claimIds: [ids.claim],
      sourceIds: [ids.source],
      limitationIds: [],
    });
    expect(JSON.stringify(fields)).not.toMatch(
      /prompt|reasoning|stderr|runner|envelope|fence|token|cas|path/i,
    );
  });

  it("derives stable opaque limitation IDs without leaking their text into IDs", () => {
    const payload = AgentOutputCandidateSchema.parse({
      kind: "memo",
      sourceArtifactIds: [ids.source],
      positions: [
        {
          claimId: ids.claim,
          stance: "uncertain",
          publicSummary: {
            en: "Evidence is limited.",
            ko: "근거가 제한적입니다.",
          },
          evidenceArtifactIds: [ids.source],
        },
      ],
      dissent: [],
      unknowns: [
        {
          en: "Consensus data is unavailable.",
          ko: "컨센서스 데이터가 없습니다.",
        },
      ],
    });
    const first = publicArtifactEventFields(payload);
    const replay = publicArtifactEventFields(payload);
    expect(first.limitationIds).toEqual(replay.limitationIds);
    expect(first.limitationIds[0]).toMatch(/^limitation:memo:[a-f0-9]{8}$/);
    expect(first.limitationIds[0]).not.toContain("Consensus");
  });

  it("accepts only the system order and trusted character ownership", () => {
    let events: readonly WorkflowPublicEvent[] = [];
    events = append(events, draft("run_created", 1));
    events = append(events, draft("collection_started", 2));
    events = append(events, draft("evidence_cutoff_recorded", 3));
    events = append(events, draft("snapshot_sealed", 4));
    events = append(events, draft("mandate_sealed", 5));
    const memo = appendWorkflowPublicEvent(
      events,
      draft("specialist_memo_committed", 6, {
        actorId: "market",
        participantIds: ["market"],
        artifactId: ids.artifact,
        logicalArtifactId: "memo:market",
        claimIds: [ids.claim],
        sourceIds: [ids.source],
      }),
      "trusted_artifact_commit",
    );
    expect(memo.ok && memo.event.bubbleEligible).toBe(true);
    expect(memo.ok && memo.event.phase).toBe("evidence_collection");

    expect(
      appendWorkflowPublicEvent(
        events,
        draft("specialist_memo_committed", 6, {
          actorId: "company",
          participantIds: ["company"],
          artifactId: ids.artifact,
          logicalArtifactId: "memo:market",
        }),
        "trusted_artifact_commit",
      ),
    ).toEqual({ ok: false, reason: "actor_ownership_mismatch" });
    expect(
      appendWorkflowPublicEvent(events, draft("mandate_sealed", 6), "system"),
    ).toEqual({ ok: false, reason: "event_order_invalid" });
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("specialist_memo_committed", 6),
        "system",
      ),
    ).toEqual({ ok: false, reason: "event_authority_invalid" });
  });

  it("rejects cross-run, out-of-order, duplicate, and model-authored events", () => {
    let events: readonly WorkflowPublicEvent[] = [];
    events = append(events, draft("run_created", 1));
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("collection_started", 2, {
          runId: "90000000-0000-4000-8000-000000000009",
        }),
        "system",
      ),
    ).toEqual({ ok: false, reason: "cross_run_event" });
    expect(
      appendWorkflowPublicEvent(events, draft("snapshot_sealed", 2), "system"),
    ).toEqual({ ok: false, reason: "event_order_invalid" });
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("collection_started", 1),
        "system",
      ),
    ).toEqual({ ok: false, reason: "event_sequence_invalid" });
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("collection_started", 2),
        "model",
      ),
    ).toEqual({ ok: false, reason: "event_authority_invalid" });
  });

  it("accepts global-ledger gaps but rejects duplicate or backward workflow sequences", () => {
    const events = durableHistory(["run_created"]);
    const withGap = appendWorkflowPublicEvent(
      events,
      draft("collection_started", 4),
      "system",
    );
    expect(withGap.ok).toBe(true);
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("collection_started", 1),
        "system",
      ),
    ).toEqual({ ok: false, reason: "event_sequence_invalid" });
  });

  it("strictly parses durable DTOs and rejects private persisted fields", () => {
    const event = durableHistory(["run_created"])[0];
    expect(parseWorkflowPublicEvent(event)).toEqual(event);
    expect(
      parseWorkflowPublicEvent({ ...event, prompt: "private" }),
    ).toBeUndefined();
  });

  it("requires an accepted artifact before speech and keeps system/verifier events silent", () => {
    let events: readonly WorkflowPublicEvent[] = [];
    for (const [index, kind] of (
      [
        "run_created",
        "collection_started",
        "evidence_cutoff_recorded",
        "snapshot_sealed",
        "mandate_sealed",
      ] as const
    ).entries())
      events = append(events, draft(kind, index + 1));

    expect(
      appendWorkflowPublicEvent(
        events,
        draft("specialist_memo_committed", 6, {
          actorId: "market",
          participantIds: ["market"],
          logicalArtifactId: "memo:market",
        }),
        "trusted_artifact_commit",
      ),
    ).toEqual({ ok: false, reason: "accepted_artifact_required" });
    expect(events.every((event) => event.bubbleEligible === false)).toBe(true);
  });

  it("orders audit, gathering, ballots, committee, chair, and atomic publication", () => {
    let events = durableHistory([
      "run_created",
      "collection_started",
      "evidence_cutoff_recorded",
      "snapshot_sealed",
      "mandate_sealed",
      ...Array<WorkflowEventDraft["kind"]>(11).fill(
        "specialist_memo_committed",
      ),
      ...Array<WorkflowEventDraft["kind"]>(4).fill(
        "department_consolidation_committed",
      ),
      ...Array<WorkflowEventDraft["kind"]>(4).fill("challenge_committed"),
      ...Array<WorkflowEventDraft["kind"]>(4).fill("owner_response_committed"),
    ]);
    events = append(
      events,
      draft("structural_audit_completed", events.length + 1, {
        artifactId: ids.artifact,
        logicalArtifactId: "structural_audit:system",
      }),
    );
    events = append(
      events,
      draft("semantic_audit_committed", events.length + 1, {
        artifactId: "30000000-0000-4000-8000-000000000013",
        logicalArtifactId: "semantic_audit:system",
      }),
      "trusted_artifact_commit",
    );
    expect(events.at(-1)?.bubbleEligible).toBe(false);
    events = append(events, draft("gathering_started", events.length + 1));
    expect(
      appendWorkflowPublicEvent(
        events,
        draft("committee_classified", events.length + 1),
        "system",
      ),
    ).toEqual({ ok: false, reason: "event_order_invalid" });
    for (const [index, actorId] of (
      ["market", "company", "financial", "risk"] as const
    ).entries())
      events = append(
        events,
        draft("department_ballot_committed", events.length + 1, {
          actorId,
          participantIds:
            actorId === "market"
              ? ["market", "risk"]
              : actorId === "company"
                ? ["company", "financial"]
                : actorId === "financial"
                  ? ["financial", "market"]
                  : ["risk", "company"],
          artifactId: `30000000-0000-4000-8000-${(30 + index).toString().padStart(12, "0")}`,
          logicalArtifactId: `response_ballot:${actorId}`,
        }),
        "trusted_artifact_commit",
      );
    events = append(events, draft("committee_classified", events.length + 1));
    events = append(
      events,
      draft("chair_synthesis_committed", events.length + 1, {
        actorId: "chair",
        participantIds: [
          "chair",
          "market",
          "company",
          "financial",
          "risk",
        ],
        artifactId: "30000000-0000-4000-8000-000000000041",
        logicalArtifactId: "chair_synthesis:chair",
      }),
      "trusted_artifact_commit",
    );
    const published = appendWorkflowPublicEvent(
      events,
      draft("report_published", events.length + 1, {
        artifactId: "30000000-0000-4000-8000-000000000042",
        reportId: "70000000-0000-4000-8000-000000000007",
        reportVersionId: "80000000-0000-4000-8000-000000000008",
      }),
      "atomic_report_publication",
    );
    expect(published.ok && published.event.bubbleEligible).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  CALL_BUDGET_POLICY,
  reserveResearchLaunch,
  summarizeCallBudget,
} from "./callBudget";
import {
  attemptId,
  completedSchedule,
  EXPECTED_REQUIRED_ARTIFACT_IDS,
  openLedger,
  outcome,
  reserve,
} from "./callBudget.testSupport";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "./roleRegistry";

const REQUIRED_IDS = [
  "memo:market",
  "memo:market_news",
  "consolidation:market",
  "response_ballot:risk",
  "semantic_audit:system",
  "chair_synthesis:chair",
] as const;

describe("WorkflowV1 physical launch budget", () => {
  it("reserves the exact independent base policy of 26 physical launches", () => {
    // Given
    const ledger = openLedger();
    // When
    const summary = summarizeCallBudget(ledger);
    // Then
    expect(CALL_BUDGET_POLICY).toEqual({
      version: "WorkflowV1",
      initialCollectionAttempts: 1,
      mandatoryFirstAttempts: 25,
      maxOptionalFollowups: 3,
      maxRequiredReplacements: 5,
      maxPhysicalLaunches: 34,
    });
    expect(summary.physicalLaunches).toBe(26);
    expect(summary.burnedOrdinals).toBe(0);
  });

  it("accepts absolute ordinal 34 and terminalizes ordinal 35", () => {
    // Given
    const request = {
      attemptId: attemptId(34),
      logicalArtifactId: REQUIRED_IDS[0],
      purpose: "mandatory_first",
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    } as const;
    // When
    const ordinal34 = reserveResearchLaunch(openLedger(), {
      ...request,
      ordinal: 34,
    });
    const ordinal35 = reserveResearchLaunch(openLedger(), {
      ...request,
      ordinal: 35,
      attemptId: attemptId(35),
    });
    // Then
    expect(ordinal34.kind).toBe("reserved");
    expect(ordinal34.ledger.launches).toHaveLength(1);
    expect(ordinal35.kind).toBe("incomplete");
    expect(ordinal35.ledger.incompleteReason).toBe("ordinal_limit");
    expect(ordinal35.ledger.launches).toHaveLength(0);
  });

  it("allows three follow-ups plus five replacements at exactly 34", () => {
    // Given
    const expectedRequiredArtifacts = 25;
    // When
    const ledger = completedSchedule(5, 3);
    // Then
    expect(EXPECTED_REQUIRED_ARTIFACT_IDS).toHaveLength(
      expectedRequiredArtifacts,
    );
    expect(summarizeCallBudget(ledger)).toMatchObject({
      physicalLaunches: 34,
      followups: 3,
      replacements: 5,
      burnedOrdinals: 33,
    });
    expect(ledger.status).toBe("open");
  });

  it("keeps four replacements plus three follow-ups valid at 33", () => {
    // Given
    const ledger = completedSchedule(4, 3);
    // When
    const summary = summarizeCallBudget(ledger);
    // Then
    expect(summary.physicalLaunches).toBe(33);
    expect(summary.burnedOrdinals).toBe(32);
    expect(ledger.status).toBe("open");
    const fourthFollowup = reserveResearchLaunch(ledger, {
      ordinal: 33,
      attemptId: attemptId(33),
      logicalArtifactId: "followup:fourth",
      purpose: "optional_followup",
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    });
    expect(fourthFollowup.ledger.incompleteReason).toBe(
      "optional_followup_limit",
    );
  });

  it("terminalizes reuse, a sixth replacement, and replacement of a follow-up", () => {
    // Given
    const burned = outcome(
      reserve(openLedger(), 1, REQUIRED_IDS[0], "mandatory_first"),
      1,
      "lost",
    );
    // When
    const reused = reserveResearchLaunch(burned, {
      ordinal: 1,
      attemptId: attemptId(2),
      logicalArtifactId: REQUIRED_IDS[0],
      purpose: "required_replacement",
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    });
    // Then
    expect(reused.kind).toBe("incomplete");
    expect(reused.ledger.incompleteReason).toBe("ordinal_reused");

    // Given
    let exhausted = openLedger();
    let ordinal = 10;
    for (const id of REQUIRED_IDS.slice(0, 6)) {
      exhausted = outcome(
        reserve(exhausted, ordinal, id, "mandatory_first"),
        ordinal,
        "timeout",
      );
      if (id !== REQUIRED_IDS[5]) {
        exhausted = outcome(
          reserve(exhausted, ordinal + 1, id, "required_replacement"),
          ordinal + 1,
          "accepted",
        );
      }
      ordinal += 2;
    }
    // When
    const sixth = reserveResearchLaunch(exhausted, {
      ordinal,
      attemptId: attemptId(ordinal),
      logicalArtifactId: REQUIRED_IDS[5],
      purpose: "required_replacement",
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    });
    // Then
    expect(sixth.ledger.incompleteReason).toBe(
      "replacement_capacity_exhausted",
    );

    // Given
    const optional = outcome(
      reserve(openLedger(), 33, "followup:optional", "optional_followup"),
      33,
      "uncertain",
    );
    // When
    const optionalReplacement = reserveResearchLaunch(optional, {
      ordinal: 34,
      attemptId: attemptId(34),
      logicalArtifactId: "followup:optional",
      purpose: "required_replacement",
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    });
    // Then
    expect(optionalReplacement.ledger.incompleteReason).toBe(
      "replacement_not_required",
    );
  });

  it("covers early, late, and chair failures and terminal second launches", () => {
    // Given
    const stages = [REQUIRED_IDS[0], REQUIRED_IDS[3], REQUIRED_IDS[5]] as const;
    const failures = [
      "invalid_schema",
      "process_crash",
      "timeout",
      "lost",
      "uncertain",
    ] as const;
    // When
    const results = stages.flatMap((id) =>
      failures.map((failure, failureIndex) => {
        const firstOrdinal = failureIndex * 2 + 1;
        const failed = outcome(
          reserve(openLedger(), firstOrdinal, id, "mandatory_first"),
          firstOrdinal,
          failure,
        );
        const replacement = reserve(
          failed,
          firstOrdinal + 1,
          id,
          "required_replacement",
        );
        return outcome(replacement, firstOrdinal + 1, failure);
      }),
    );
    // Then
    expect(results).toHaveLength(15);
    expect(
      results.every(
        (ledger) =>
          ledger.status === "incomplete" &&
          ledger.incompleteReason === "second_failed_required_launch",
      ),
    ).toBe(true);
  });

  it("rejects roster drift and every independently generated schedule above policy", () => {
    // Given
    const expectedTotals = [
      [26, 27, 28, 29],
      [27, 28, 29, 30],
      [28, 29, 30, 31],
      [29, 30, 31, 32],
      [30, 31, 32, 33],
      [31, 32, 33, 34],
    ] as const;
    // When
    const totals = expectedTotals.map((row, replacements) =>
      row.map(
        (_expected, followups) =>
          summarizeCallBudget(completedSchedule(replacements, followups))
            .physicalLaunches,
      ),
    );
    const drift = reserveResearchLaunch(openLedger(), {
      ordinal: 1,
      attemptId: attemptId(1),
      logicalArtifactId: REQUIRED_IDS[0],
      purpose: "mandatory_first",
      rosterFingerprint: "WorkflowV1:drifted",
    });
    // Then
    expect(totals).toEqual(expectedTotals);
    expect(totals.flat().every((total) => total <= 34)).toBe(true);
    expect(drift.ledger.incompleteReason).toBe("roster_drift");
  });
});

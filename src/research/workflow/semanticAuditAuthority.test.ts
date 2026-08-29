import { describe, expect, it } from "vitest";
import { semanticPublicationBlockers } from "./semanticAuditAuthority";

describe("semantic publication policy", () => {
  it.each(["partial", "not_assessable"] as const)(
    "does not let a sole %s material claim stand in for a grounded answer",
    (verdict) => {
      // Given
      const material = new Set(["claim-1"]);

      // When
      const blockers = semanticPublicationBlockers(
        material,
        [{ claimId: "claim-1", verdict, contradictionSeverity: "none" }],
        [{ questionId: "question-1", status: "partial" }],
      );

      // Then
      expect(blockers).toEqual(["no_grounded_core_answer"]);
    },
  );

  it("blocks a contradicted material claim", () => {
    // Given
    const material = new Set(["claim-1"]);

    // When
    const blockers = semanticPublicationBlockers(
      material,
      [
        {
          claimId: "claim-1",
          verdict: "contradicted",
          contradictionSeverity: "severe",
        },
      ],
      [{ questionId: "question-1", status: "uncovered" }],
    );

    // Then
    expect(blockers).toEqual(["no_grounded_core_answer"]);
  });

  it("removes one contradicted material claim without terminating surviving research", () => {
    // Given
    const material = new Set(["claim-1", "claim-2"]);

    // When
    const blockers = semanticPublicationBlockers(
      material,
      [
        {
          claimId: "claim-1",
          verdict: "contradicted",
          contradictionSeverity: "severe",
        },
        {
          claimId: "claim-2",
          verdict: "entailed",
          contradictionSeverity: "none",
        },
      ],
      [],
    );

    // Then
    expect(blockers).toEqual([]);
  });

  it("blocks when a limited contradiction leaves no grounded core answer", () => {
    // Given
    const material = new Set(["claim-1"]);

    // When
    const blockers = semanticPublicationBlockers(
      material,
      [
        {
          claimId: "claim-1",
          verdict: "contradicted",
          contradictionSeverity: "limited",
        },
      ],
      [],
    );

    // Then
    expect(blockers).toEqual(["no_grounded_core_answer"]);
  });

  it("keeps an uncovered question as a disclosed limitation", () => {
    const blockers = semanticPublicationBlockers(
      new Set(["claim-1"]),
      [
        {
          claimId: "claim-1",
          verdict: "partial",
          contradictionSeverity: "none",
        },
      ],
      [{ questionId: "question-1", status: "uncovered" }],
    );

    expect(blockers).toEqual(["no_grounded_core_answer"]);
  });
});

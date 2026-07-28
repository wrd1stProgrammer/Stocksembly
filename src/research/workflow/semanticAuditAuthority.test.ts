import { describe, expect, it } from "vitest";
import { semanticPublicationBlockers } from "./semanticAuditAuthority";

describe("semantic publication policy", () => {
  it.each(["partial", "not_assessable"] as const)(
    "retains a %s material claim as a disclosed limitation",
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
      expect(blockers).toEqual([]);
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
    expect(blockers).toEqual(["material_claim_contradicted:claim-1"]);
  });

  it("removes a limited contradiction without terminating the report", () => {
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
    expect(blockers).toEqual([]);
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

    expect(blockers).toEqual([]);
  });
});

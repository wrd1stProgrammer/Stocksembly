import { describe, expect, it } from "vitest";
import { selectChairClaims } from "./chairSynthesisClaimSelection";

describe("selectChairClaims", () => {
  it("deduplicates retained dissent and audited claim identifiers before chair synthesis", () => {
    const claimId = "955cb8e0-5b9d-41e4-b083-ad9cb9582495";
    const selected = selectChairClaims({
      structuralClaims: [{ claimId }],
      semanticallyAcceptedClaimIds: new Set([claimId]),
      positionClaimIds: [claimId],
      revisions: [{ adjudicatedClaimId: claimId }],
      retainedDissentClaimIds: [claimId, claimId],
    });

    expect(selected.auditedClaimIds).toEqual([claimId]);
    expect(selected.retainedDissentClaimIds).toEqual([claimId]);
  });

  it("keeps comparator absence out of a non-relative investment conclusion", () => {
    const limitationId = "955cb8e0-5b9d-41e4-b083-ad9cb9582495";
    const operatingId = "dc116656-ec82-479b-bcdf-84dd5b42de2f";
    const selected = selectChairClaims({
      structuralClaims: [
        {
          claimId: limitationId,
          text: {
            en: "Peer comparison is unavailable, so relative strength cannot be confirmed.",
            ko: "동종기업 비교 데이터가 없어 상대 강도를 확인할 수 없습니다.",
          },
        },
        {
          claimId: operatingId,
          text: {
            en: "Operating cash flow does not cover capital expenditure.",
            ko: "영업현금흐름이 설비투자를 충당하지 못합니다.",
          },
        },
      ],
      semanticallyAcceptedClaimIds: new Set([limitationId, operatingId]),
      positionClaimIds: [limitationId, operatingId],
      revisions: [],
      retainedDissentClaimIds: [],
      excludeComparatorAbsenceClaims: true,
    });

    expect(selected.auditedClaimIds).toEqual([operatingId]);
  });
});

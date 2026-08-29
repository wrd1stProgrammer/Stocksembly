import { describe, expect, it } from "vitest";
import {
  evaluatePublicClaimEligibility,
  evaluatePublicClaimEligibilityReport,
} from "./publicClaimEligibility";

describe("public claim eligibility", () => {
  it("publishes an entailed factual claim", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "revenue-growth",
      kind: "factual_claim",
      materiality: "material",
      semanticVerdict: "entailed",
    });

    expect(result).toMatchObject({
      action: "publish",
      eligibility: "entailed",
      reasonCode: "fact_entailed",
    });
  });

  it("publishes an analytical conclusion only when its lineage names entailed inputs", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "margin-expansion",
      kind: "analytical_conclusion",
      materiality: "material",
      inputFacts: [
        { claimId: "gross-margin", semanticVerdict: "entailed" },
        { claimId: "operating-cost", semanticVerdict: "entailed" },
      ],
      lineage: {
        kind: "calculation",
        inputClaimIds: ["gross-margin", "operating-cost"],
      },
    });

    expect(result).toMatchObject({
      action: "publish",
      eligibility: "derived_supported",
      reasonCode: "analytical_derived_supported",
    });
  });

  it("limits an analytical conclusion with a partial input instead of publishing it", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "margin-expansion",
      kind: "analytical_conclusion",
      materiality: "material",
      inputFacts: [
        { claimId: "gross-margin", semanticVerdict: "entailed" },
        { claimId: "operating-cost", semanticVerdict: "partial" },
      ],
      lineage: {
        kind: "reasoning",
        inputClaimIds: ["gross-margin", "operating-cost"],
      },
    });

    expect(result).toMatchObject({
      action: "limitations_only",
      eligibility: "partial",
      reasonCode: "analytical_partial_input",
    });
  });

  it("limits a partial factual claim to the limitations surface", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "partial-revenue-growth",
      kind: "factual_claim",
      materiality: "material",
      semanticVerdict: "partial",
    });

    expect(result).toMatchObject({
      action: "limitations_only",
      eligibility: "partial",
      reasonCode: "fact_partial",
    });
  });

  it("omits an analytical conclusion with a non-entailed input", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "margin-expansion",
      kind: "analytical_conclusion",
      materiality: "material",
      inputFacts: [
        { claimId: "gross-margin", semanticVerdict: "not_assessable" },
      ],
      lineage: {
        kind: "reasoning",
        inputClaimIds: ["gross-margin"],
      },
    });

    expect(result).toMatchObject({
      action: "omit",
      eligibility: "invalid",
      reasonCode: "analytical_input_not_entailed",
    });
  });

  it.each(["not_assessable", "contradicted"] as const)(
    "omits a %s factual claim",
    (semanticVerdict) => {
      const result = evaluatePublicClaimEligibility({
        claimId: "unverified-claim",
        kind: "factual_claim",
        materiality: "material",
        semanticVerdict,
      });

      expect(result).toMatchObject({
        action: "omit",
        eligibility: semanticVerdict,
        reasonCode: `fact_${semanticVerdict}`,
      });
    },
  );

  it("fails soft for malformed input without publishing it", () => {
    const result = evaluatePublicClaimEligibility({
      claimId: "unknown-verdict",
      kind: "unknown_claim_type",
      materiality: "material",
      semanticVerdict: "invented",
    });

    expect(result).toEqual({
      action: "omit",
      eligibility: "invalid",
      reasonCode: "invalid_public_claim",
    });
  });

  it("keeps a mixed report publishable while isolating partial and invalid claims", () => {
    const result = evaluatePublicClaimEligibilityReport({
      claims: [
        {
          claimId: "revenue-growth",
          kind: "factual_claim",
          materiality: "material",
          semanticVerdict: "entailed",
        },
        {
          claimId: "margin-expansion",
          kind: "analytical_conclusion",
          materiality: "material",
          inputFacts: [{ claimId: "gross-margin", semanticVerdict: "partial" }],
          lineage: {
            kind: "reasoning",
            inputClaimIds: ["gross-margin"],
          },
        },
        { claimId: "bad", kind: "unknown" },
      ],
    });

    expect(result).toMatchObject({ publishable: true, blockers: [] });
    expect(result.claims.map((claim) => claim.action)).toEqual([
      "publish",
      "limitations_only",
      "omit",
    ]);
  });

  it("omits an analytical-only core claim whose grounded factual input is absent", () => {
    const result = evaluatePublicClaimEligibilityReport({
      claims: [
        {
          claimId: "margin-expansion",
          kind: "analytical_conclusion",
          materiality: "material",
          inputFacts: [
            { claimId: "gross-margin", semanticVerdict: "entailed" },
          ],
          lineage: {
            kind: "calculation",
            inputClaimIds: ["gross-margin"],
          },
        },
      ],
    });

    expect(result).toEqual({
      claims: [
        {
          claimId: "margin-expansion",
          action: "omit",
          eligibility: "invalid",
          reasonCode: "analytical_grounded_input_absent",
        },
      ],
      publishable: false,
      blockers: ["no_grounded_core_answer"],
    });
  });

  it("returns no_grounded_core_answer as the sole blocker when all core claims are invalid", () => {
    const result = evaluatePublicClaimEligibilityReport({
      claims: [
        {
          claimId: "partial-fact",
          kind: "factual_claim",
          materiality: "material",
          semanticVerdict: "partial",
        },
        {
          claimId: "missing-input",
          kind: "analytical_conclusion",
          materiality: "material",
          inputFacts: [
            { claimId: "unverified-input", semanticVerdict: "not_assessable" },
          ],
          lineage: {
            kind: "reasoning",
            inputClaimIds: ["unverified-input"],
          },
        },
      ],
    });

    expect(result).toMatchObject({
      publishable: false,
      blockers: ["no_grounded_core_answer"],
    });
  });
});

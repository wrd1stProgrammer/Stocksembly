import { describe, expect, it } from "vitest";
import {
  EDITORIAL_STANCE_CONTRACT_VERSION,
  evaluateEditorialNarrativeContract,
  evaluateEditorialStance,
} from "./editorialStance";

const input = (
  identity: string,
  direction: "upside" | "downside",
  materiality: "material" | "supporting" = "material",
) => ({
  issuerSecurity: "NASDAQ:SPCX common",
  metricOrEventIdentity: identity,
  periodOrAsOf: "FY2026 / 2026-08-29",
  direction,
  materiality,
  sourceQualified: true,
  semanticQualified: true,
});

describe("editorial stance", () => {
  it("deduplicates citations for one underlying input and retains independent inputs", () => {
    const result = evaluateEditorialStance([
      input("revenue_growth", "upside"),
      input("revenue_growth", "upside"),
      input("margin_expansion", "upside"),
    ]);

    expect(result.contractVersion).toBe(EDITORIAL_STANCE_CONTRACT_VERSION);
    expect(result.stance).toBe("upside_skewed");
    expect(result.directionalWeights).toEqual({ upside: 4, downside: 0 });
    expect(result.inputs).toHaveLength(2);
  });

  it("does not deduplicate a stale period into the current underlying input", () => {
    const result = evaluateEditorialStance([
      input("revenue_growth", "upside"),
      {
        ...input("revenue_growth", "upside"),
        periodOrAsOf: "FY2025 / 2025-08-29",
      },
    ]);

    expect(result.inputs).toHaveLength(2);
    expect(result.stance).toBe("upside_skewed");
  });

  it("marks opposing interpretations of one input as contested with zero directional weight", () => {
    const result = evaluateEditorialStance([
      input("revenue_growth", "upside"),
      input("revenue_growth", "downside"),
      input("margin_expansion", "upside"),
    ]);

    expect(result.stance).toBe("insufficient_evidence");
    expect(result.directionalWeights).toEqual({ upside: 2, downside: 0 });
    expect(result.inputs).toContainEqual(
      expect.objectContaining({
        status: "contested",
        directionalWeight: 0,
      }),
    );
  });

  it("selects a 6-to-3 directional advantage despite dissent", () => {
    const result = evaluateEditorialStance([
      input("revenue_growth", "upside"),
      input("margin_expansion", "upside"),
      input("cash_conversion", "upside"),
      input("regulatory_risk", "downside"),
      input("valuation_multiple", "downside", "supporting"),
    ]);

    expect(result.stance).toBe("upside_skewed");
    expect(result.directionalWeights).toEqual({ upside: 6, downside: 3 });
  });

  it("returns balanced for a grounded 5-to-4 split without the required lead", () => {
    const result = evaluateEditorialStance([
      input("revenue_growth", "upside"),
      input("margin_expansion", "upside"),
      input("cash_conversion", "upside", "supporting"),
      input("valuation_multiple", "downside"),
      input("regulatory_risk", "downside"),
    ]);

    expect(result.stance).toBe("balanced");
    expect(result.directionalWeights).toEqual({ upside: 5, downside: 4 });
  });

  it("returns insufficient evidence for thin, absent, and malformed input", () => {
    expect(
      evaluateEditorialStance([input("revenue_growth", "upside")]).stance,
    ).toBe("insufficient_evidence");
    expect(evaluateEditorialStance([]).stance).toBe("insufficient_evidence");
    expect(
      evaluateEditorialStance([
        {
          ...input("bad_input", "upside"),
          direction: "sideways",
          materiality: "heavy",
        },
      ]).stance,
    ).toBe("insufficient_evidence");
  });

  it("requires a directional first sentence, owned countercase/invalidation, and one generic posture", () => {
    expect(
      evaluateEditorialNarrativeContract({
        stance: "upside_skewed",
        firstSentence: "For this horizon, upside evidence dominates.",
        countercase: {
          sectionKey: "dissent_unknowns",
          text: "Valuation compression is the countercase.",
        },
        invalidation: {
          sectionKey: "change_conditions",
          text: "Invalidate the view if margin expansion reverses.",
        },
        coreSections: ["Wait for the next earnings checkpoint."],
      }).passed,
    ).toBe(true);
    expect(
      evaluateEditorialNarrativeContract({
        stance: "upside_skewed",
        firstSentence: "The evidence is interesting.",
        countercase: {
          sectionKey: "supported_analysis",
          text: "A risk remains.",
        },
        invalidation: {
          sectionKey: "supported_analysis",
          text: "A condition remains.",
        },
        coreSections: ["Wait for confirmation.", "This is conditional."],
      }).violations,
    ).toEqual(
      expect.arrayContaining([
        "first_sentence_direction_missing",
        "countercase_section_invalid",
        "invalidation_section_invalid",
        "generic_posture_repeated",
      ]),
    );
    expect(
      evaluateEditorialNarrativeContract({
        stance: "upside_skewed",
        firstSentence: "For this horizon, upside evidence dominates.",
        countercase: {
          sectionKey: "dissent_unknowns",
          text: "Valuation compression is the countercase.",
        },
        invalidation: {
          sectionKey: "change_conditions",
          text: "Invalidate the view if margin expansion reverses.",
        },
        coreSections: ["Wait. Wait."],
      }).violations,
    ).toContain("generic_posture_repeated");
  });
});

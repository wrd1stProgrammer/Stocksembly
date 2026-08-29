import { describe, expect, it, vi } from "vitest";
import { recoverPublicPublication } from "./publicationRecovery";

const sourceIds = ["sec-revenue", "sec-margin", "event-news", "form4"];

function fact(
  claimId: string,
  semanticVerdict: "entailed" | "partial" | "contradicted" | "not_assessable",
  materiality: "material" | "supporting" = "supporting",
  sourceId = "sec-revenue",
) {
  return {
    claim: {
      claimId,
      kind: "factual_claim" as const,
      materiality,
      semanticVerdict,
    },
    text: { en: claimId, ko: claimId },
    sourceIds: [sourceId],
  };
}

function derived(claimId: string, inputClaimId: string, sourceId: string) {
  return {
    claim: {
      claimId,
      kind: "analytical_conclusion" as const,
      materiality: "material" as const,
      inputFacts: [
        { claimId: inputClaimId, semanticVerdict: "entailed" as const },
      ],
      lineage: { kind: "reasoning" as const, inputClaimIds: [inputClaimId] },
    },
    text: { en: claimId, ko: claimId },
    sourceIds: [sourceId],
  };
}

describe("recoverPublicPublication", () => {
  it("publishes a mixed grounded subset and caps one deduplicated limitations block at three facts", () => {
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [
        fact("revenue", "entailed", "material"),
        fact("margin", "entailed", "material", "sec-margin"),
        derived("operating-leverage", "revenue", "sec-revenue"),
        derived("margin-direction", "margin", "sec-margin"),
        fact("partial-high", "partial", "material"),
        fact("partial-duplicate", "partial", "material"),
        fact("partial-support-1", "partial"),
        fact("partial-support-2", "partial"),
        fact("unknown-1", "not_assessable"),
        fact("unknown-2", "not_assessable"),
      ],
      limitationMateriality: {
        "partial-high": 100,
        "partial-duplicate": 90,
        "partial-support-1": 80,
        "partial-support-2": 70,
      },
      limitationDeduplicationKeys: {
        "partial-high": "same limitation",
        "partial-duplicate": "same limitation",
      },
      scenarios: [],
    });

    expect(result.blockers).toEqual([]);
    expect(result.publishedClaims.map((item) => item.claim.claimId)).toEqual([
      "revenue",
      "margin",
      "operating-leverage",
      "margin-direction",
    ]);
    expect(result.limitations).toEqual([
      expect.objectContaining({
        claim: expect.objectContaining({ claimId: "partial-high" }),
      }),
      expect.objectContaining({
        claim: expect.objectContaining({ claimId: "partial-support-1" }),
      }),
      expect.objectContaining({
        claim: expect.objectContaining({ claimId: "partial-support-2" }),
      }),
    ]);
    expect(
      result.omissions.flatMap((item) =>
        "claimId" in item ? [item.claimId] : [],
      ),
    ).toEqual(
      expect.arrayContaining(["partial-duplicate", "unknown-1", "unknown-2"]),
    );
  });

  it("omits forged sources, invalid source purposes, and malformed scenarios item-locally", () => {
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [
        fact("core", "entailed", "material"),
        { ...fact("forged", "entailed"), sourceIds: ["forged-source"] },
        {
          ...fact("form4-valuation", "entailed", "supporting", "form4"),
          sourcePurpose: {
            required: "valuation_metric" as const,
            bindings: [],
          },
        },
        {
          ...fact("news-revenue", "entailed", "supporting", "event-news"),
          sourcePurpose: {
            required: "accounting_metric" as const,
            bindings: [],
          },
        },
      ],
      scenarios: [
        { id: "valid", claimIds: ["core"], sourceIds: ["sec-revenue"] },
        { id: "invalid", claimIds: ["core"], sourceIds: ["forged-source"] },
      ],
    });

    expect(result.publishedClaims.map((item) => item.claim.claimId)).toEqual([
      "core",
    ]);
    expect(result.publishedScenarios.map((item) => item.id)).toEqual(["valid"]);
    expect(JSON.stringify(result)).not.toContain('"sourceId":"forged-source"');
    expect(result.omissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: "forged",
          reason: "unknown_source",
        }),
        expect.objectContaining({
          claimId: "form4-valuation",
          reason: "source_purpose_not_allowed",
        }),
        expect.objectContaining({
          claimId: "news-revenue",
          reason: "source_purpose_not_allowed",
        }),
        expect.objectContaining({
          itemId: "invalid",
          reason: "scenario_source_invalid",
        }),
      ]),
    );
  });

  it("never exposes a partial limitation backed by a forged or purpose-mismatched source", () => {
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [
        fact("core", "entailed", "material"),
        { ...fact("partial-forged", "partial"), sourceIds: ["forged"] },
        {
          ...fact("partial-form4", "partial", "supporting", "form4"),
          sourcePurpose: {
            required: "valuation_metric" as const,
            bindings: [],
          },
        },
      ],
      scenarios: [],
    });

    expect(result.limitations).toEqual([]);
    expect(result.omissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: "partial-forged",
          reason: "unknown_source",
        }),
        expect.objectContaining({
          claimId: "partial-form4",
          reason: "source_purpose_not_allowed",
        }),
      ]),
    );
  });

  it("uses at most one item-scoped repair before omission", () => {
    const repair = vi.fn(() => ({
      ...fact("repairable", "entailed", "supporting"),
      sourceIds: ["still-forged"],
    }));
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [{ ...fact("repairable", "entailed"), sourceIds: ["forged"] }],
      scenarios: [],
      repairClaim: repair,
    });

    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.repairAttempts).toEqual([
      { claimId: "repairable", attempts: 1 },
    ]);
    expect(result.publishedClaims).toEqual([]);
    expect(result.omissions).toContainEqual(
      expect.objectContaining({
        claimId: "repairable",
        reason: "unknown_source",
      }),
    );
  });

  it("repairs a malformed scenario once before omitting the still-invalid item", () => {
    const repairScenario = vi.fn((scenario) => ({
      ...scenario,
      sourceIds: ["still-forged"],
    }));
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [fact("core", "entailed", "material")],
      scenarios: [
        { id: "malformed", claimIds: ["core"], sourceIds: ["forged"] },
      ],
      repairScenario,
    });

    expect(repairScenario).toHaveBeenCalledTimes(1);
    expect(result.scenarioRepairAttempts).toEqual([
      { itemId: "malformed", attempts: 1 },
    ]);
    expect(result.publishedScenarios).toEqual([]);
    expect(result.omissions).toContainEqual({
      itemId: "malformed",
      reason: "scenario_source_invalid",
    });
  });

  it("returns the sole content blocker only when no grounded material answer remains", () => {
    const result = recoverPublicPublication({
      registeredSourceIds: sourceIds,
      claims: [
        fact("partial", "partial", "material"),
        fact("unknown", "not_assessable"),
      ],
      scenarios: [],
    });

    expect(result.blockers).toEqual(["no_grounded_core_answer"]);
  });
});

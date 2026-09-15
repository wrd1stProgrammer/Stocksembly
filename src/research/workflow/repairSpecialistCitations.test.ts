import { describe, expect, it } from "vitest";
import { repairSpecialistCitations } from "./repairSpecialistCitations";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";

const valid = "00000000-0000-4000-8000-000000000001";
const invalid = "00000000-0000-4000-8000-000000000999";
const text = {
  en: "Demand supports expansion.",
  ko: "수요가 확장을 뒷받침합니다.",
};
function memo() {
  return SpecialistMemoOutputSchema.parse({
    kind: "memo",
    chartCommentaryJson: null,
    sourceArtifactIds: [valid, invalid],
    positions: [valid, invalid].map((id, index) => ({
      claimId: `00000000-0000-4000-8000-00000000000${index + 2}`,
      decisionDimension: "growth_engine",
      roleOwner: "company",
      stance: "supports",
      materiality: "material",
      publicSummary: text,
      evidenceArtifactIds: [id],
      decisiveMetricIds: ["revenue"],
      strongestContraryObservation: text,
      falsifier: text,
    })),
    dissent: [],
    unknowns: [],
  });
}

describe("specialist citation repair", () => {
  it("retains valid claims unchanged and removes the whole invalid claim", () => {
    const input = memo();
    const result = SpecialistMemoOutputSchema.parse(
      repairSpecialistCitations(input, [valid]),
    );
    expect(result.positions).toEqual([input.positions[0]]);
    expect(result.sourceArtifactIds).toEqual([valid]);
    expect(result.unknowns[0]?.en).toContain("omitted");
    expect(JSON.stringify(result)).not.toContain(invalid);
  });
  it("withholds an entirely unbound assessment instead of relabelling it as grounded", () => {
    const input = memo();
    const rejected = {
      ...input,
      positions: [input.positions[1]],
      chartCommentaryJson: "unverified chart",
      dissent: [{ claimId: input.positions[1]!.claimId, publicSummary: text }],
    };
    const result = SpecialistMemoOutputSchema.parse(
      repairSpecialistCitations(rejected, [valid]),
    );
    expect(result.positions[0]?.stance).toBe("uncertain");
    expect(result.positions[0]?.decisiveMetricIds).toEqual([]);
    expect(result.positions[0]?.publicSummary.en).toContain("unavailable");
    expect(JSON.stringify(result)).not.toContain(text.en);
    expect(result.dissent).toEqual([]);
    expect(result.chartCommentaryJson).toBeNull();
    expect(result.sourceArtifactIds).toEqual([valid]);
  });
  it("does not manufacture an evidence reference when the bound inventory is empty", () => {
    const input = memo();
    expect(repairSpecialistCitations(input, [])).toBe(input);
  });
});

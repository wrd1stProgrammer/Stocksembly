import { describe, expect, it } from "vitest";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { CHAIR_SECTION_KEYS } from "./chairSynthesisContracts";
import { mixedClaimValidationFixture } from "./chairSynthesis.testSupport";
import { repairChairCandidate } from "./chairSynthesisValidation";

describe("chair synthesis semantic repair", () => {
  it("produces all required sections when a schema-valid draft omits one", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const incomplete = {
      ...candidate,
      sections: candidate.sections.filter(
        (section) => section.sectionKey !== "operational_scenarios",
      ),
    };

    // When
    const repaired = repairChairCandidate(JSON.stringify(prompt), incomplete);

    // Then
    const parsed = ChairSynthesisOutputSchema.parse(repaired);
    expect(parsed.sections.map((section) => section.sectionKey)).toEqual(
      CHAIR_SECTION_KEYS,
    );
  });

  it("replaces unknown sentence IDs with audited section evidence", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "change_conditions"
          ? { ...section, sentenceIds: ["sentence:not-in-catalog"] }
          : section,
      ),
    };

    // When
    const repaired = ChairSynthesisOutputSchema.parse(
      repairChairCandidate(JSON.stringify(prompt), invalid),
    );

    // Then
    const condition = repaired.sections.find(
      (section) => section.sectionKey === "change_conditions",
    );
    expect(condition?.sentenceIds).not.toContain("sentence:not-in-catalog");
    expect(condition?.sentenceIds.length).toBeGreaterThan(0);
  });
});

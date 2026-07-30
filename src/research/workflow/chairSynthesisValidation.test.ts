import { describe, expect, it } from "vitest";
import { chairValidationReason } from "../application/assembleReportValidation";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { mixedClaimValidationFixture } from "./chairSynthesis.testSupport";
import { CHAIR_SECTION_KEYS } from "./chairSynthesisContracts";
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

  it("repairs a fluent summary that shares no language with its selected evidence", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: "Entirely unrelated outlook.",
                ko: "선택 근거와 무관한 전망입니다.",
              },
            }
          : section,
      ),
    };

    // When
    const repaired = ChairSynthesisOutputSchema.parse(
      repairChairCandidate(JSON.stringify(prompt), invalid),
    );

    // Then
    const brief = repaired.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    expect(brief?.publicSummary).toEqual({ en: "Claim A", ko: "Claim A" });
    expect(
      chairValidationReason({
        chair: repaired,
        sentences: prompt.sentences,
        auditedClaimIds: new Set(prompt.auditedClaimIds),
        retainedDissentClaimIds: prompt.dissentClaimIds,
        retainedOpenQuestionCount: prompt.unknownIds.length,
      }),
    ).toBeUndefined();
  });
});

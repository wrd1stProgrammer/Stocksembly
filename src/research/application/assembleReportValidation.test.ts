import { describe, expect, it } from "vitest";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { makeAuthoritativeReportInput } from "./assembleReport.testSupport";
import { chairValidationReason } from "./assembleReportValidation";

describe("publication chair validation", () => {
  it("preserves a complete V3 brief beyond the legacy display limit while still checking its lineage", () => {
    const fixture = makeAuthoritativeReportInput();
    const chair = ChairSynthesisOutputSchema.parse(fixture.chair);
    const brief = chair.sections.find(
      (s) => s.sectionKey === "ten_second_brief",
    );
    if (brief === undefined) throw new Error("Missing brief fixture");
    const summary = {
      en: `${brief.publicSummary.en} ${"The evidence remains conditional on future cash conversion. ".repeat(7)}`,
      ko: `${brief.publicSummary.ko} ${"향후 현금 전환을 확인해야 이 판단을 유지할 수 있습니다. ".repeat(14)}`,
    };
    expect(summary.en.length).toBeGreaterThan(360);
    const updated = {
      ...chair,
      sections: chair.sections.map((s) =>
        s.sectionKey === "ten_second_brief"
          ? { ...s, publicSummary: summary }
          : s,
      ),
    };
    const validate = (candidate: typeof chair) =>
      chairValidationReason({
        chair: candidate,
        locale: chair.canonicalNarrativeV3?.sourceLocale,
        sentences: fixture.chairSentences,
        auditedClaimIds: new Set(fixture.editorialClaims.map((c) => c.claimId)),
        retainedDissentClaimIds: [],
        retainedOpenQuestionCount: 0,
      });
    expect(validate(updated)).toBeUndefined();
    expect(validate({ ...updated, canonicalNarrativeV3: undefined })).toBe(
      "chair_content_mismatch",
    );
    expect(
      validate({
        ...updated,
        sections: updated.sections.map((s) =>
          s.sectionKey === "ten_second_brief"
            ? { ...s, sentenceIds: ["missing-sentence"] }
            : s,
        ),
      }),
    ).toBe("chair_content_mismatch");
  });
});

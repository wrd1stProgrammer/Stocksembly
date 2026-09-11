import type { z } from "zod";
import type { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { sanitizePublicEditorialText } from "../domain/editorialQuality";
import { normalizeReaderFacingPrecision } from "../workflow/chairSynthesisTextValidation";

type Canonical = NonNullable<
  z.infer<typeof ChairSynthesisOutputSchema>["canonicalNarrativeV3"]
>;

export function normalizePublicationWording(canonical: Canonical) {
  let changed = false;
  const text = (value: string) => {
    const normalized = normalizeReaderFacingPrecision(
      sanitizePublicEditorialText(value),
    ).trim();
    const result = normalized || value;
    changed ||= result !== value;
    return result;
  };
  const result: Canonical = {
    ...canonical,
    decisiveReason: text(canonical.decisiveReason),
    strongestCountercase: text(canonical.strongestCountercase),
    invalidationCheckpoint: text(canonical.invalidationCheckpoint),
    teamViews: canonical.teamViews.map((view) => ({
      ...view,
      position: text(view.position),
      rationale: text(view.rationale),
    })),
    sections: canonical.sections.map((section) => ({
      ...section,
      narrative: text(section.narrative),
    })),
    anticipatedQuestions: canonical.anticipatedQuestions.map((item) => ({
      ...item,
      question: text(item.question),
      answer: text(item.answer),
    })),
  };
  return { canonical: result, changed };
}

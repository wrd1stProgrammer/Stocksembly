import type { z } from "zod";
import {
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
  ChairSynthesisV3ModelOutputSchema,
  ChairSynthesisV3RawModelOutputSchema,
  chairSynthesisV3Prompt,
  containsDirectOrderImperative,
  containsRepeatedGenericPosture,
} from "./chairSynthesisContracts";
import {
  chairDirectionalBriefAssignment,
  chairSectionPrimaryAssignments,
} from "./chairSynthesisPrompts";
import {
  projectChairAssignments,
  validChairCandidate,
} from "./chairSynthesisValidation";
import { publicTextIsValid } from "./chairSynthesisTextValidation";

type RawOutput = z.infer<typeof ChairSynthesisV3RawModelOutputSchema>;
type CatalogSentence = Readonly<{
  sentenceId: string;
  claimIds: readonly string[];
  sourceArtifactIds: readonly string[];
  text: Readonly<{ en: string; ko: string }>;
}>;

export function canonicalNarrativeV3IsGrounded(input: Readonly<{
  canonical: RawOutput;
  sentences: readonly CatalogSentence[];
  auditedClaimIds: readonly string[];
  sourceArtifactIds: readonly string[];
}>): boolean {
  const catalog = new Map(
    input.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const units = [
    [input.canonical.decisiveReason, input.canonical.decisionLineage.decisiveReason],
    [input.canonical.strongestCountercase, input.canonical.decisionLineage.strongestCountercase],
    [input.canonical.invalidationCheckpoint, input.canonical.decisionLineage.invalidationCheckpoint],
    ...input.canonical.teamViews.flatMap((view) => [
      [view.position, view.lineage] as const,
      [view.rationale, view.lineage] as const,
    ]),
    ...input.canonical.sections.map(
      (section) => [section.narrative, section.lineage] as const,
    ),
    ...input.canonical.anticipatedQuestions.flatMap((item) => [
      [item.question, item.lineage] as const,
      [item.answer, item.lineage] as const,
    ]),
  ] as const;
  return units.every(([text, lineage]) => {
    const sentences = lineage.sentenceIds
      .map((sentenceId) => catalog.get(sentenceId))
      .filter((sentence): sentence is CatalogSentence => sentence !== undefined);
    if (sentences.length !== lineage.sentenceIds.length) return false;
    const claimIds = new Set(sentences.flatMap((sentence) => sentence.claimIds));
    const sourceArtifactIds = new Set(
      sentences.flatMap((sentence) => sentence.sourceArtifactIds),
    );
    return (
      claimIds.size === lineage.claimIds.length &&
      sourceArtifactIds.size === lineage.sourceArtifactIds.length &&
      lineage.claimIds.every(
        (claimId) =>
          claimIds.has(claimId) && input.auditedClaimIds.includes(claimId),
      ) &&
      lineage.sourceArtifactIds.every(
        (artifactId) =>
          sourceArtifactIds.has(artifactId) &&
          input.sourceArtifactIds.includes(artifactId),
      ) &&
      publicTextIsValid(
        { en: text, ko: text },
        sentences,
        4_000,
        input.canonical.sourceLocale,
      )
    );
  });
}

function degradedText(
  locale: "en" | "ko",
  field: "countercase" | "invalidation",
): string {
  if (field === "countercase")
    return locale === "ko"
      ? "근거에 기반한 반대 논거가 유지되지 않았습니다."
      : "No grounded countercase was retained.";
  return locale === "ko"
    ? "검증 가능한 근거가 바뀌면 판단을 재검토합니다."
    : "Reassess when the verified evidence changes.";
}

function locallyDegrade(output: RawOutput): RawOutput | undefined {
  const originalSafeSections = output.sections.filter(
    (section) => !containsDirectOrderImperative(section.narrative),
  );
  const safeSections = output.sections.map((section) => ({
    ...section,
    narrative: containsDirectOrderImperative(section.narrative)
      ? degradedText(output.sourceLocale, "invalidation")
      : section.narrative,
  }));
  const repeatedPosture = containsRepeatedGenericPosture(output);
  const genericPosture =
    /\b(?:wait|conditional|needs?\s+confirmation)\b|대기|조건부|확인\s*필요/iu;
  const directEvidenceText =
    output.sourceLocale === "ko"
      ? output.stance === "downside_skewed"
        ? "검증된 하방 근거가 우세합니다."
        : output.stance === "upside_skewed"
          ? "검증된 상방 근거가 우세합니다."
          : output.stance === "insufficient_evidence"
            ? "검증된 근거가 부족합니다."
            : "검증된 근거가 균형을 이룹니다."
      : output.stance === "downside_skewed"
        ? "Verified downside evidence dominates."
        : output.stance === "upside_skewed"
          ? "Verified upside evidence dominates."
          : output.stance === "insufficient_evidence"
            ? "Verified evidence is insufficient."
            : "Verified evidence is balanced.";
  const decisiveReason = containsDirectOrderImperative(output.decisiveReason)
    ? originalSafeSections[0]?.narrative
    : repeatedPosture && genericPosture.test(output.decisiveReason)
      ? directEvidenceText
      : output.decisiveReason;
  if (decisiveReason === undefined) return undefined;
  return {
    ...output,
    decisiveReason,
    strongestCountercase: containsDirectOrderImperative(
      output.strongestCountercase,
    )
      ? degradedText(output.sourceLocale, "countercase")
      : output.strongestCountercase,
    invalidationCheckpoint: containsDirectOrderImperative(
      output.invalidationCheckpoint,
    )
      ? degradedText(output.sourceLocale, "invalidation")
      : output.invalidationCheckpoint,
    teamViews: output.teamViews.map((view) => ({
      ...view,
      position: containsDirectOrderImperative(view.position)
        ? degradedText(output.sourceLocale, "invalidation")
        : view.position,
      rationale: containsDirectOrderImperative(view.rationale)
        ? degradedText(output.sourceLocale, "invalidation")
        : view.rationale,
    })),
    sections: safeSections.map((section) => ({
      ...section,
      narrative:
        repeatedPosture &&
        section.sectionKey !== "change_conditions" &&
        genericPosture.test(section.narrative)
          ? directEvidenceText
          : section.narrative,
    })),
    anticipatedQuestions: output.anticipatedQuestions.filter(
      (item) =>
        !containsDirectOrderImperative(item.question) &&
        !containsDirectOrderImperative(item.answer),
    ),
  };
}

export async function synthesizeChairV3(input: Readonly<{
  sourceLocale: "en" | "ko";
  evidenceCatalog: string;
  runModel: (prompt: string) => Promise<unknown>;
}>): Promise<z.infer<typeof ChairSynthesisV3ModelOutputSchema>> {
  const initialPrompt = chairSynthesisV3Prompt(input);
  const initial = ChairSynthesisV3RawModelOutputSchema.parse(
    await input.runModel(initialPrompt),
  );
  if (initial.sourceLocale !== input.sourceLocale)
    throw new TypeError("chair_v3_source_locale_mismatch");
  const accepted = ChairSynthesisV3ModelOutputSchema.safeParse(initial);
  if (accepted.success) return accepted.data;
  const repairPrompt = JSON.stringify({
    kind: "chair_synthesis_v3_bounded_rewrite",
    sourceLocale: input.sourceLocale,
    instruction:
      "Rewrite only direct order or hedge-heavy public sentences into direct evidence language. Preserve the schema and grounded meaning.",
    candidate: initial,
  });
  const repaired = ChairSynthesisV3RawModelOutputSchema.parse(
    await input.runModel(repairPrompt),
  );
  if (repaired.sourceLocale !== input.sourceLocale)
    throw new TypeError("chair_v3_source_locale_mismatch");
  const repairedAccepted = ChairSynthesisV3ModelOutputSchema.safeParse(repaired);
  if (repairedAccepted.success) return repairedAccepted.data;
  const degraded = locallyDegrade(repaired);
  if (degraded === undefined)
    throw new TypeError("chair_v3_no_grounded_core_answer");
  return ChairSynthesisV3ModelOutputSchema.parse(degraded);
}

export function projectChairV3ForCommit(
  validationPrompt: string,
  canonical: z.infer<typeof ChairSynthesisV3ModelOutputSchema>,
) {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(validationPrompt));
  if (prompt.mandate.locale !== canonical.sourceLocale)
    throw new TypeError("chair_v3_source_locale_mismatch");
  const assignments = chairSectionPrimaryAssignments(prompt);
  const directional = chairDirectionalBriefAssignment(prompt, assignments);
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  type Lineage = RawOutput["decisionLineage"]["decisiveReason"];
  const lineageFor = (sentence: (typeof prompt.sentences)[number]): Lineage => ({
    sentenceIds: [sentence.sentenceId],
    claimIds: sentence.claimIds,
    sourceArtifactIds: sentence.sourceArtifactIds,
  });
  const grounded = (text: string, lineage: Lineage): string => {
    const referenced = lineage.sentenceIds.map((sentenceId) =>
      catalog.get(sentenceId),
    );
    if (referenced.some((sentence) => sentence === undefined))
      throw new TypeError("chair_v3_lineage_sentence_missing");
    const sentences = referenced.filter(
      (sentence): sentence is (typeof prompt.sentences)[number] =>
        sentence !== undefined,
    );
    const claimIds = new Set(sentences.flatMap((sentence) => sentence.claimIds));
    const sourceArtifactIds = new Set(
      sentences.flatMap((sentence) => sentence.sourceArtifactIds),
    );
    if (
      lineage.claimIds.some(
        (claimId) =>
          !claimIds.has(claimId) || !prompt.auditedClaimIds.includes(claimId),
      ) ||
      lineage.sourceArtifactIds.some(
        (artifactId) =>
          !sourceArtifactIds.has(artifactId) ||
          !prompt.sourceArtifactIds.includes(artifactId),
      ) ||
      claimIds.size !== lineage.claimIds.length ||
      sourceArtifactIds.size !== lineage.sourceArtifactIds.length
    )
      throw new TypeError("chair_v3_lineage_mismatch");
    const localized = { en: text, ko: text };
    return publicTextIsValid(
      localized,
      sentences,
      4_000,
      canonical.sourceLocale,
    )
      ? text
      : sentences[0]?.text[canonical.sourceLocale] ?? text;
  };
  const authoritativeStance =
    directional.stance === "wait_for_proof"
      ? "balanced"
      : directional.stance;
  const stanceConflict = canonical.stance !== authoritativeStance;
  const normalizedCanonical: RawOutput = {
    ...canonical,
    stance: authoritativeStance,
    decisiveReason: stanceConflict
      ? directional.decisive.text[canonical.sourceLocale]
      : grounded(
          canonical.decisiveReason,
          canonical.decisionLineage.decisiveReason,
        ),
    decisionLineage: {
      ...canonical.decisionLineage,
      decisiveReason: stanceConflict
        ? lineageFor(directional.decisive)
        : canonical.decisionLineage.decisiveReason,
    },
    strongestCountercase: grounded(
      canonical.strongestCountercase,
      canonical.decisionLineage.strongestCountercase,
    ),
    invalidationCheckpoint: grounded(
      canonical.invalidationCheckpoint,
      canonical.decisionLineage.invalidationCheckpoint,
    ),
    teamViews: canonical.teamViews.map((view) => ({
      ...view,
      position: grounded(view.position, view.lineage),
      rationale: grounded(view.rationale, view.lineage),
    })),
    sections: canonical.sections.map((section) => ({
      ...section,
      narrative: grounded(section.narrative, section.lineage),
    })),
    anticipatedQuestions: canonical.anticipatedQuestions.map((item) => ({
      ...item,
      question: grounded(item.question, item.lineage),
      answer: grounded(item.answer, item.lineage),
    })),
  };
  const raw = ChairSynthesisModelOutputSchema.parse({
    kind: "chair_synthesis",
    decisionBrief: {
      stance: directional.stance,
      confidence: directional.confidence,
      decisiveReason: directional.decisive.text,
      strongestCountercase: directional.countercase.text,
      falsifier: directional.falsifier.text,
      primaryClaimIds: directional.primaryClaimIds,
      decisiveSentenceId: directional.decisive.sentenceId,
      countercaseSentenceId: directional.countercase.sentenceId,
      falsifierSentenceId: directional.falsifier.sentenceId,
      primarySentenceIds: directional.primarySentenceIds,
    },
    selectedUnknownIds: [],
    sections: assignments.map((assignment) => {
      const sentence = catalog.get(assignment.primarySentenceId);
      if (sentence === undefined)
        throw new TypeError("chair_v3_primary_assignment_missing");
      return {
        sectionKey: assignment.sectionKey,
        publicSummary: sentence.text,
        primarySentenceId: assignment.primarySentenceId,
        sentenceIds: [assignment.primarySentenceId],
        conflictAdjudication: null,
      };
    }),
  });
  const projection = projectChairAssignments(validationPrompt, raw);
  if (projection === undefined)
    throw new TypeError("chair_v3_structural_projection_failed");
  const committed = validChairCandidate(validationPrompt, projection.candidate);
  if (typeof committed !== "object" || committed === null)
    throw new TypeError("chair_v3_grounding_failed");
  return { ...committed, canonicalNarrativeV3: normalizedCanonical };
}

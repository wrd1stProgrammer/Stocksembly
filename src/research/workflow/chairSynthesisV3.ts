import type { z } from "zod";
import { ArtifactIdSchema, ClaimIdSchema } from "../domain/ids";
import {
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
  ChairSynthesisV3ModelOutputSchema,
  ChairSynthesisV3RawModelOutputSchema,
  ChairSynthesisV3RunnerOutputSchema,
  chairSynthesisV3Prompt,
  containsDirectOrderImperative,
  containsRepeatedGenericPosture,
} from "./chairSynthesisContracts";
import {
  chairDirectionalBriefAssignment,
  chairSectionPrimaryAssignments,
} from "./chairSynthesisPrompts";
import { publicTextIsValid } from "./chairSynthesisTextValidation";
import {
  projectChairAssignments,
  validChairCandidate,
} from "./chairSynthesisValidation";

type RawOutput = z.infer<typeof ChairSynthesisV3RawModelOutputSchema>;
type CatalogSentence = Readonly<{
  sentenceId: string;
  claimIds: readonly string[];
  sourceArtifactIds: readonly string[];
  text: Readonly<{ en: string; ko: string }>;
}>;

type CanonicalLineage = RawOutput["decisionLineage"]["decisiveReason"];

type ChairSectionAuthority = Readonly<{
  sectionKey: RawOutput["sections"][number]["sectionKey"];
  primarySentenceId: string;
}>;

function canonicalUnitMatchesEvidence(
  input: Readonly<{
    text: string;
    lineage: CanonicalLineage;
    canonical: RawOutput;
    catalog: ReadonlyMap<string, CatalogSentence>;
    sourceArtifactIds: readonly string[];
  }>,
): boolean {
  const sentences = input.lineage.sentenceIds
    .map((sentenceId) => input.catalog.get(sentenceId))
    .filter((sentence): sentence is CatalogSentence => sentence !== undefined);
  if (sentences.length !== input.lineage.sentenceIds.length) return false;
  const claimIds = new Set(sentences.flatMap((sentence) => sentence.claimIds));
  const sourceArtifactIds = new Set(
    sentences.flatMap((sentence) => sentence.sourceArtifactIds),
  );
  return (
    claimIds.size === input.lineage.claimIds.length &&
    sourceArtifactIds.size === input.lineage.sourceArtifactIds.length &&
    input.lineage.claimIds.every((claimId) => claimIds.has(claimId)) &&
    input.lineage.sourceArtifactIds.every(
      (artifactId) =>
        sourceArtifactIds.has(artifactId) &&
        input.sourceArtifactIds.includes(artifactId),
    ) &&
    publicTextIsValid(
      { en: input.text, ko: input.text },
      sentences,
      4_000,
      input.canonical.sourceLocale,
    )
  );
}

function canonicalUnitIsGrounded(
  input: Readonly<{
    text: string;
    lineage: CanonicalLineage;
    canonical: RawOutput;
    catalog: ReadonlyMap<string, CatalogSentence>;
    auditedClaimIds: readonly string[];
    sourceArtifactIds: readonly string[];
  }>,
): boolean {
  return (
    canonicalUnitMatchesEvidence(input) &&
    input.lineage.claimIds.every((claimId) =>
      input.auditedClaimIds.includes(claimId),
    )
  );
}

export function normalizeCanonicalNarrativeV3ForPublication(
  input: Readonly<{
    canonical: RawOutput;
    sentences: readonly CatalogSentence[];
    auditedClaimIds: readonly string[];
    sourceArtifactIds: readonly string[];
    sections: readonly ChairSectionAuthority[];
  }>,
): Readonly<{
  canonical: RawOutput;
  reduced: boolean;
  anticipatedQuestionIndexes: readonly number[];
}> {
  const catalog = new Map(
    input.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const authorities = new Map(
    input.sections.map((section) => [section.sectionKey, section]),
  );
  let reduced = false;
  const lineageFor = (sentence: CatalogSentence): CanonicalLineage => ({
    sentenceIds: [sentence.sentenceId],
    claimIds: sentence.claimIds.map((claimId) => ClaimIdSchema.parse(claimId)),
    sourceArtifactIds: sentence.sourceArtifactIds.map((artifactId) =>
      ArtifactIdSchema.parse(artifactId),
    ),
  });
  const groundedFallback = (
    lineage: CanonicalLineage,
    preferredSectionKey: RawOutput["sections"][number]["sectionKey"],
  ) => {
    const preferredSentenceId =
      authorities.get(preferredSectionKey)?.primarySentenceId;
    const candidates = [
      ...lineage.sentenceIds.map((sentenceId) => catalog.get(sentenceId)),
      preferredSentenceId === undefined
        ? undefined
        : catalog.get(preferredSentenceId),
      ...catalog.values(),
    ].filter((sentence): sentence is CatalogSentence => sentence !== undefined);
    for (const sentence of candidates) {
      const fallbackLineage = lineageFor(sentence);
      const text = sentence.text[input.canonical.sourceLocale];
      if (
        canonicalUnitIsGrounded({
          text,
          lineage: fallbackLineage,
          canonical: input.canonical,
          catalog,
          auditedClaimIds: input.auditedClaimIds,
          sourceArtifactIds: input.sourceArtifactIds,
        })
      )
        return { text, lineage: fallbackLineage };
    }
    return undefined;
  };
  const normalizeUnit = (
    text: string,
    lineage: CanonicalLineage,
    preferredSectionKey: RawOutput["sections"][number]["sectionKey"],
  ) => {
    const unit = {
      text,
      lineage,
      canonical: input.canonical,
      catalog,
      auditedClaimIds: input.auditedClaimIds,
      sourceArtifactIds: input.sourceArtifactIds,
    };
    if (canonicalUnitIsGrounded(unit)) return { text, lineage };
    const fallback = groundedFallback(lineage, preferredSectionKey);
    if (fallback !== undefined) reduced = true;
    return fallback ?? { text, lineage };
  };
  const decisive = normalizeUnit(
    input.canonical.decisiveReason,
    input.canonical.decisionLineage.decisiveReason,
    "ten_second_brief",
  );
  const countercase = normalizeUnit(
    input.canonical.strongestCountercase,
    input.canonical.decisionLineage.strongestCountercase,
    "dissent_unknowns",
  );
  const invalidation = normalizeUnit(
    input.canonical.invalidationCheckpoint,
    input.canonical.decisionLineage.invalidationCheckpoint,
    "change_conditions",
  );
  const teamViews = input.canonical.teamViews.map((view) => {
    const shared = {
      lineage: view.lineage,
      canonical: input.canonical,
      catalog,
      auditedClaimIds: input.auditedClaimIds,
      sourceArtifactIds: input.sourceArtifactIds,
    };
    if (
      canonicalUnitIsGrounded({ ...shared, text: view.position }) &&
      canonicalUnitIsGrounded({ ...shared, text: view.rationale })
    )
      return view;
    const fallback = groundedFallback(view.lineage, "supported_analysis");
    if (fallback === undefined) return view;
    reduced = true;
    return {
      ...view,
      position: fallback.text,
      rationale: fallback.text,
      lineage: fallback.lineage,
    };
  });
  const sections = input.canonical.sections.map((section) => {
    const normalized = normalizeUnit(
      section.narrative,
      section.lineage,
      section.sectionKey,
    );
    return {
      ...section,
      narrative: normalized.text,
      lineage: normalized.lineage,
    };
  });
  const anticipatedQuestionIndexes: number[] = [];
  const anticipatedQuestions = input.canonical.anticipatedQuestions.flatMap(
    (item, index) => {
      const question = {
        text: item.question,
        lineage: item.lineage,
        canonical: input.canonical,
        catalog,
        auditedClaimIds: input.auditedClaimIds,
        sourceArtifactIds: input.sourceArtifactIds,
      };
      const answer = { ...question, text: item.answer };
      if (
        canonicalUnitIsGrounded(question) &&
        canonicalUnitIsGrounded(answer)
      ) {
        anticipatedQuestionIndexes.push(index);
        return [item];
      }
      reduced = true;
      return [];
    },
  );
  return {
    canonical: {
      ...input.canonical,
      decisiveReason: decisive.text,
      strongestCountercase: countercase.text,
      invalidationCheckpoint: invalidation.text,
      decisionLineage: {
        decisiveReason: decisive.lineage,
        strongestCountercase: countercase.lineage,
        invalidationCheckpoint: invalidation.lineage,
      },
      teamViews,
      sections,
      anticipatedQuestions,
    },
    reduced,
    anticipatedQuestionIndexes,
  };
}

export function canonicalNarrativeV3IsGrounded(
  input: Readonly<{
    canonical: RawOutput;
    sentences: readonly CatalogSentence[];
    auditedClaimIds: readonly string[];
    sourceArtifactIds: readonly string[];
  }>,
): boolean {
  const catalog = new Map(
    input.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const units = [
    [
      input.canonical.decisiveReason,
      input.canonical.decisionLineage.decisiveReason,
    ],
    [
      input.canonical.strongestCountercase,
      input.canonical.decisionLineage.strongestCountercase,
    ],
    [
      input.canonical.invalidationCheckpoint,
      input.canonical.decisionLineage.invalidationCheckpoint,
    ],
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
  return units.every(([text, lineage]) =>
    canonicalUnitIsGrounded({
      text,
      lineage,
      canonical: input.canonical,
      catalog,
      auditedClaimIds: input.auditedClaimIds,
      sourceArtifactIds: input.sourceArtifactIds,
    }),
  );
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

function locallyDegrade(output: RawOutput): RawOutput {
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
    ? (originalSafeSections[0]?.narrative ?? directEvidenceText)
    : repeatedPosture && genericPosture.test(output.decisiveReason)
      ? directEvidenceText
      : output.decisiveReason;
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

export function deterministicChairV3Fallback(
  validationPrompt: string,
): z.infer<typeof ChairSynthesisV3ModelOutputSchema> {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(validationPrompt));
  const assignments = chairSectionPrimaryAssignments(prompt);
  const directional = chairDirectionalBriefAssignment(prompt, assignments);
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  type Sentence = (typeof prompt.sentences)[number];
  type Lineage = RawOutput["decisionLineage"]["decisiveReason"];
  const lineageFor = (sentence: Sentence): Lineage => ({
    sentenceIds: [sentence.sentenceId],
    claimIds: sentence.claimIds,
    sourceArtifactIds: sentence.sourceArtifactIds,
  });
  const textFor = (sentence: Sentence) => sentence.text[prompt.mandate.locale];
  const positionSentences = prompt.sentences.filter(
    (sentence) => sentence.kind === "position",
  );
  const assignedPositionIds = new Set<string>();
  const positionForDepartment = (
    departmentId: RawOutput["teamViews"][number]["departmentId"],
    artifactId: (typeof prompt.departmentPositions)[number]["artifactId"],
  ) => {
    const exact = positionSentences.find(
      (sentence) =>
        !assignedPositionIds.has(sentence.sentenceId) &&
        (sentence.sourceArtifactIds.includes(artifactId) ||
          sentence.sentenceId.toLowerCase().includes(departmentId)),
    );
    const available =
      exact ??
      positionSentences.find(
        (sentence) => !assignedPositionIds.has(sentence.sentenceId),
      ) ??
      directional.decisive;
    assignedPositionIds.add(available.sentenceId);
    return available;
  };
  const stance =
    directional.stance === "wait_for_proof"
      ? ("balanced" as const)
      : directional.stance;
  const fallback: RawOutput = {
    kind: "chair_synthesis_v3",
    sourceLocale: prompt.mandate.locale,
    stance,
    decisiveReason: textFor(directional.decisive),
    strongestCountercase: textFor(directional.countercase),
    invalidationCheckpoint: textFor(directional.falsifier),
    decisionLineage: {
      decisiveReason: lineageFor(directional.decisive),
      strongestCountercase: lineageFor(directional.countercase),
      invalidationCheckpoint: lineageFor(directional.falsifier),
    },
    teamViews: prompt.departmentPositions.map((position) => {
      const sentence = positionForDepartment(
        position.departmentId,
        position.artifactId,
      );
      return {
        departmentId: position.departmentId,
        position: textFor(sentence),
        rationale: textFor(sentence),
        vote:
          prompt.ballots.find(
            (ballot) => ballot.departmentId === position.departmentId,
          )?.vote ?? "abstain",
        lineage: lineageFor(sentence),
      };
    }),
    sections: assignments.map((assignment) => {
      const sentence = catalog.get(assignment.primarySentenceId);
      if (sentence === undefined)
        throw new TypeError("chair_v3_primary_assignment_missing");
      return {
        sectionKey: assignment.sectionKey,
        narrative: textFor(sentence),
        lineage: lineageFor(sentence),
      };
    }),
    anticipatedQuestions: [],
  };
  return ChairSynthesisV3ModelOutputSchema.parse(locallyDegrade(fallback));
}

export async function synthesizeChairV3(
  input: Readonly<{
    sourceLocale: "en" | "ko";
    evidenceCatalog: string;
    runModel: (prompt: string) => Promise<unknown>;
  }>,
): Promise<z.infer<typeof ChairSynthesisV3ModelOutputSchema>> {
  const initialPrompt = chairSynthesisV3Prompt(input);
  const modelOutput = await input.runModel(initialPrompt);
  const transported = ChairSynthesisV3RunnerOutputSchema.safeParse(modelOutput);
  let rawModelOutput = modelOutput;
  if (transported.success) {
    try {
      rawModelOutput = JSON.parse(transported.data.candidateJson);
    } catch {
      throw new TypeError("chair_v3_transport_json_invalid");
    }
  }
  const initial = ChairSynthesisV3RawModelOutputSchema.parse(rawModelOutput);
  if (initial.sourceLocale !== input.sourceLocale)
    throw new TypeError("chair_v3_source_locale_mismatch");
  // Never spend another reserved model launch on a public-writing defect.
  // Local degradation preserves the grounded structure and removes only the
  // unsafe or excessively conditional wording.
  return ChairSynthesisV3ModelOutputSchema.parse(locallyDegrade(initial));
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
  const authenticatedLineage = (
    lineage: Lineage,
    fallback: (typeof prompt.sentences)[number],
  ): Lineage => {
    const authenticated = lineage.sentenceIds
      .map((sentenceId) => catalog.get(sentenceId))
      .filter(
        (sentence): sentence is (typeof prompt.sentences)[number] =>
          sentence !== undefined,
      );
    const retained = authenticated.length > 0 ? authenticated : [fallback];
    return {
      sentenceIds: [
        ...new Set(retained.map((sentence) => sentence.sentenceId)),
      ],
      claimIds: [...new Set(retained.flatMap((sentence) => sentence.claimIds))],
      sourceArtifactIds: [
        ...new Set(retained.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
    };
  };
  const assignmentBySection = new Map(
    assignments.map((assignment) => [assignment.sectionKey, assignment]),
  );
  const fallbackForSection = (
    sectionKey: RawOutput["sections"][number]["sectionKey"],
  ) => {
    const sentenceId = assignmentBySection.get(sectionKey)?.primarySentenceId;
    return (
      (sentenceId === undefined ? undefined : catalog.get(sentenceId)) ??
      directional.decisive
    );
  };
  const fallbackForDepartment = (
    departmentId: RawOutput["teamViews"][number]["departmentId"],
  ) =>
    prompt.sentences.find(
      (sentence) =>
        sentence.kind === "position" &&
        sentence.sentenceId.toLowerCase().includes(departmentId),
    ) ?? directional.decisive;
  const canonicalWithAuthenticatedLineage: RawOutput = {
    ...canonical,
    decisionLineage: {
      decisiveReason: authenticatedLineage(
        canonical.decisionLineage.decisiveReason,
        directional.decisive,
      ),
      strongestCountercase: authenticatedLineage(
        canonical.decisionLineage.strongestCountercase,
        directional.countercase,
      ),
      invalidationCheckpoint: authenticatedLineage(
        canonical.decisionLineage.invalidationCheckpoint,
        directional.falsifier,
      ),
    },
    teamViews: canonical.teamViews.map((view) => ({
      ...view,
      lineage: authenticatedLineage(
        view.lineage,
        fallbackForDepartment(view.departmentId),
      ),
    })),
    sections: canonical.sections.map((section) => ({
      ...section,
      lineage: authenticatedLineage(
        section.lineage,
        fallbackForSection(section.sectionKey),
      ),
    })),
    anticipatedQuestions: canonical.anticipatedQuestions
      .filter((item) =>
        item.lineage.sentenceIds.some((sentenceId) => catalog.has(sentenceId)),
      )
      .map((item) => ({
        ...item,
        lineage: authenticatedLineage(item.lineage, directional.falsifier),
      })),
  };
  const lineageFor = (
    sentence: (typeof prompt.sentences)[number],
  ): Lineage => ({
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
    const claimIds = new Set(
      sentences.flatMap((sentence) => sentence.claimIds),
    );
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
      : (sentences[0]?.text[canonical.sourceLocale] ?? text);
  };
  const authoritativeStance =
    directional.stance === "wait_for_proof" ? "balanced" : directional.stance;
  const stanceConflict = canonical.stance !== authoritativeStance;
  const normalizedCanonical: RawOutput = {
    ...canonicalWithAuthenticatedLineage,
    stance: authoritativeStance,
    decisiveReason: stanceConflict
      ? directional.decisive.text[canonical.sourceLocale]
      : grounded(
          canonical.decisiveReason,
          canonicalWithAuthenticatedLineage.decisionLineage.decisiveReason,
        ),
    decisionLineage: {
      ...canonicalWithAuthenticatedLineage.decisionLineage,
      decisiveReason: stanceConflict
        ? lineageFor(directional.decisive)
        : canonicalWithAuthenticatedLineage.decisionLineage.decisiveReason,
    },
    strongestCountercase: grounded(
      canonical.strongestCountercase,
      canonicalWithAuthenticatedLineage.decisionLineage.strongestCountercase,
    ),
    invalidationCheckpoint: grounded(
      canonical.invalidationCheckpoint,
      canonicalWithAuthenticatedLineage.decisionLineage.invalidationCheckpoint,
    ),
    teamViews: canonicalWithAuthenticatedLineage.teamViews.map((view) => ({
      ...view,
      position: grounded(view.position, view.lineage),
      rationale: grounded(view.rationale, view.lineage),
    })),
    sections: canonicalWithAuthenticatedLineage.sections.map((section) => ({
      ...section,
      narrative: grounded(section.narrative, section.lineage),
    })),
    anticipatedQuestions:
      canonicalWithAuthenticatedLineage.anticipatedQuestions.map((item) => ({
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

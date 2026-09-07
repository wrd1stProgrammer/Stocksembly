import type { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { ArtifactIdSchema, ClaimIdSchema } from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import {
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
  ChairSynthesisV3ModelOutputSchema,
  ChairSynthesisV3RawModelOutputSchema,
  ChairSynthesisV3RunnerOutputSchema,
  chairSynthesisV3Prompt,
  containsDirectOrderImperative,
} from "./chairSynthesisContracts";
import {
  chairDirectionalBriefAssignment,
  chairSectionPrimaryAssignments,
} from "./chairSynthesisPrompts";
import {
  normalizeReaderFacingPrecision,
  publicTextIsValid,
} from "./chairSynthesisTextValidation";
import {
  chairCandidateIssue,
  projectChairAssignments,
  validChairCandidate,
} from "./chairSynthesisValidation";

type RawOutput = z.infer<typeof ChairSynthesisV3RawModelOutputSchema>;
type PublicationReductionReason = NonNullable<
  RawOutput["publicationReductionReasons"]
>[number];
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
      ...[...catalog.values()].filter((sentence) =>
        sentence.claimIds.some((id) =>
          lineage.claimIds.includes(ClaimIdSchema.parse(id)),
        ),
      ),
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
  // Tracks only sentences this pass NEWLY hands to a department as a
  // repaired position or rationale (the successful-repair branch below).
  // This is deliberately narrow, not "every text seen so far":
  //   - An already-valid, already-distinct view (passthrough) never touches
  //     this set — it was independently grounded, not assigned from a
  //     shared candidate pool, so it is not the failure mode being guarded.
  //   - A view left unchanged because no honest replacement existed (the
  //     `position === undefined` / `rationale === undefined` branches) does
  //     not reserve its (possibly still-defective) text either — doing so
  //     would let one broken view "squat" on text a later department could
  //     otherwise have honestly recovered.
  // The one invariant this set enforces: two departments' *newly assigned*
  // recovered sentences never collide — that is what produced the archived
  // cross-index duplicates (quality/2026-09-07-teamviews-원본대조.md
  // ⓐ#12-14,20-21, GOOG 0==1, SKHY 1==2).
  const newlyAssignedTexts = new Set<string>();
  // Processed in a fixed canonical department order, not the model's own
  // teamViews array order — which department "wins" a shared candidate must
  // not depend on how the model (or a caller) happened to order its output.
  // The final array below is still returned in the original input order.
  const departmentProcessingOrder = new Map(
    WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId, index) => [
      departmentId,
      index,
    ]),
  );
  const normalizeTeamView = (
    view: RawOutput["teamViews"][number],
  ): RawOutput["teamViews"][number] => {
    const owned = input.sentences.filter(
      (sentence) =>
        sentence.sentenceId === `position:${view.departmentId}` ||
        sentence.sentenceId === `ballot:${view.departmentId}`,
    );
    const ownedClaims = new Set(owned.flatMap((sentence) => sentence.claimIds));
    const candidates = [
      ...owned,
      ...input.sentences.filter(
        (sentence) =>
          sentence.sentenceId.startsWith("claim:") &&
          sentence.claimIds.some((claimId) => ownedClaims.has(claimId)),
      ),
    ];
    const ownsLineage = view.lineage.sentenceIds.every((id) =>
      candidates.some((sentence) => sentence.sentenceId === id),
    );
    const shared = {
      lineage: view.lineage,
      canonical: input.canonical,
      catalog,
      auditedClaimIds: input.auditedClaimIds,
      sourceArtifactIds: input.sourceArtifactIds,
    };
    if (
      ownsLineage &&
      view.position.trim() !== view.rationale.trim() &&
      canonicalUnitIsGrounded({ ...shared, text: view.position }) &&
      canonicalUnitIsGrounded({ ...shared, text: view.rationale })
    )
      return view;
    const grounded = candidates.filter((sentence) =>
      canonicalUnitIsGrounded({
        ...shared,
        text: sentence.text[input.canonical.sourceLocale],
        lineage: lineageFor(sentence),
      }),
    );
    const isUnassignedThisPass = (sentence: CatalogSentence) =>
      !newlyAssignedTexts.has(
        sentence.text[input.canonical.sourceLocale].trim(),
      );
    const position =
      grounded.find(
        (sentence) =>
          sentence.sentenceId === `position:${view.departmentId}` &&
          isUnassignedThisPass(sentence),
      ) ?? grounded.find(isUnassignedThisPass);
    // No honest, not-already-assigned candidate exists. A missing value is
    // better than a silently duplicated one, so leave this view exactly as
    // it arrived rather than forcing a replacement here.
    if (position === undefined) return view;
    const rationale = grounded.find(
      (sentence) =>
        sentence.text[input.canonical.sourceLocale].trim() !==
          position.text[input.canonical.sourceLocale].trim() &&
        isUnassignedThisPass(sentence),
    );
    // Same principle as above: without a distinct, unassigned rationale
    // candidate, do not collapse rationale into position (the former
    // `?? position` fallback that manufactured ⓐ#3,16-19,22 duplicates).
    if (rationale === undefined) return view;
    reduced = true;
    newlyAssignedTexts.add(position.text[input.canonical.sourceLocale].trim());
    newlyAssignedTexts.add(
      rationale.text[input.canonical.sourceLocale].trim(),
    );
    return {
      ...view,
      position: position.text[input.canonical.sourceLocale],
      rationale: rationale.text[input.canonical.sourceLocale],
      lineage: {
        sentenceIds: [...new Set([position.sentenceId, rationale.sentenceId])],
        claimIds: [
          ...new Set([...position.claimIds, ...rationale.claimIds]),
        ].map((id) => ClaimIdSchema.parse(id)),
        sourceArtifactIds: [
          ...new Set([
            ...position.sourceArtifactIds,
            ...rationale.sourceArtifactIds,
          ]),
        ].map((id) => ArtifactIdSchema.parse(id)),
      },
    };
  };
  const teamViewResultsByDepartment = new Map(
    [...input.canonical.teamViews]
      .sort(
        (a, b) =>
          (departmentProcessingOrder.get(a.departmentId) ?? 0) -
          (departmentProcessingOrder.get(b.departmentId) ?? 0),
      )
      .map((view) => [view.departmentId, normalizeTeamView(view)] as const),
  );
  const teamViews = input.canonical.teamViews.map((view) => {
    const result = teamViewResultsByDepartment.get(view.departmentId);
    if (result === undefined)
      throw new TypeError("chair_v3_team_view_normalization_missing");
    return result;
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
  const reductionReasons = new Set<PublicationReductionReason>();
  const directOrderRewrite = (value: string, replacement: string) => {
    if (!containsDirectOrderImperative(value)) return value;
    reductionReasons.add("direct_order_rewrite");
    return replacement;
  };
  const originalSafeSections = output.sections.filter(
    (section) => !containsDirectOrderImperative(section.narrative),
  );
  const safeSections = output.sections.map((section) => ({
    ...section,
    narrative: directOrderRewrite(
      section.narrative,
      degradedText(output.sourceLocale, "invalidation"),
    ),
  }));
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
    ? directOrderRewrite(
        output.decisiveReason,
        originalSafeSections[0]?.narrative ?? directEvidenceText,
      )
    : output.decisiveReason;
  return {
    ...output,
    decisiveReason,
    strongestCountercase: directOrderRewrite(
      output.strongestCountercase,
      degradedText(output.sourceLocale, "countercase"),
    ),
    invalidationCheckpoint: directOrderRewrite(
      output.invalidationCheckpoint,
      degradedText(output.sourceLocale, "invalidation"),
    ),
    // position and rationale deliberately draw the direct-order-imperative
    // replacement from *different* canned strings ("invalidation" vs
    // "countercase" — both already-approved public copy used elsewhere in
    // this same output). If a single view's position and rationale were
    // both imperative, using the same replacement for both would silently
    // manufacture a fresh duplicate right here — the exact defect this
    // whole change set exists to remove.
    teamViews: output.teamViews.map((view) => ({
      ...view,
      position: directOrderRewrite(
        view.position,
        degradedText(output.sourceLocale, "invalidation"),
      ),
      rationale: directOrderRewrite(
        view.rationale,
        degradedText(output.sourceLocale, "countercase"),
      ),
    })),
    sections: safeSections,
    anticipatedQuestions: output.anticipatedQuestions.filter((item) => {
      const retained =
        !containsDirectOrderImperative(item.question) &&
        !containsDirectOrderImperative(item.answer);
      if (!retained) reductionReasons.add("anticipated_question_omission");
      return retained;
    }),
    ...(reductionReasons.size === 0
      ? { publicationReductionReasons: undefined }
      : { publicationReductionReasons: [...reductionReasons] }),
  };
}

// Repairs a deterministic-fallback team view whose position and rationale
// still match after locallyDegrade. This closes MAJOR-1-class gaps that
// survive the ballot-sourced rationale fix above: the catalog's
// `position:<dept>` and `ballot:<dept>` sentences can themselves already be
// textually identical (chairSynthesisInput.ts's `withoutComparatorAbsence`
// replaces both a department's position summary and its ballot rationale
// with the exact same fixed paragraph when either references an absent
// comparator), or locallyDegrade's own imperative rewrite could still
// collide despite the two-message split above (e.g. an already-identical
// pair both flagged as imperative). Tries a distinct, honestly grounded
// alternate from the department's own owned-or-related sentences before
// giving up; never fabricates new prose.
function repairIndistinctFallbackTeamView<
  Sentence extends Readonly<{
    sentenceId: string;
    claimIds: readonly string[];
    sourceArtifactIds: readonly string[];
    text: Readonly<{ en: string; ko: string }>;
  }>,
>(
  view: RawOutput["teamViews"][number],
  allSentences: readonly Sentence[],
  locale: "en" | "ko",
): RawOutput["teamViews"][number] {
  if (view.position.trim() !== view.rationale.trim()) return view;
  const owned = allSentences.filter(
    (sentence) =>
      sentence.sentenceId === `position:${view.departmentId}` ||
      sentence.sentenceId === `ballot:${view.departmentId}`,
  );
  const ownedClaims = new Set(owned.flatMap((sentence) => sentence.claimIds));
  const alternates = [
    ...owned,
    ...allSentences.filter(
      (sentence) =>
        sentence.sentenceId.startsWith("claim:") &&
        sentence.claimIds.some((claimId) => ownedClaims.has(claimId)),
    ),
  ];
  const distinct = alternates.find(
    (sentence) => sentence.text[locale].trim() !== view.position.trim(),
  );
  // No honest alternate exists anywhere in this department's own evidence.
  // This is the deterministic fallback — the last resort recovery layer —
  // so there is no further repair to attempt. Fail loud with the same
  // `chair_v3_`-prefixed convention used elsewhere in this file: the outer
  // handler (chairSynthesisHandler.ts) treats these as a structured
  // `projection_failed` outcome, not a crash (see MINOR 4 in the review
  // report for why that is the correct existing behavior here, not a new
  // one).
  if (distinct === undefined)
    throw new TypeError(
      `chair_v3_fallback_team_view_indistinct:${view.departmentId}`,
    );
  return {
    ...view,
    rationale: distinct.text[locale],
    lineage: {
      sentenceIds: [
        ...new Set([...view.lineage.sentenceIds, distinct.sentenceId]),
      ],
      claimIds: [
        ...new Set([...view.lineage.claimIds, ...distinct.claimIds]),
      ].map((id) => ClaimIdSchema.parse(id)),
      sourceArtifactIds: [
        ...new Set([
          ...view.lineage.sourceArtifactIds,
          ...distinct.sourceArtifactIds,
        ]),
      ].map((id) => ArtifactIdSchema.parse(id)),
    },
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
      // The department's own ballot rationale is a distinct, honestly
      // sourced sentence from its position summary (both are always emitted
      // together for every department in chairSynthesisInput.ts). Using it
      // here — instead of reusing `sentence` for both fields — is what stops
      // this deterministic fallback from manufacturing a position==rationale
      // duplicate (quality/2026-09-07-teamviews-원본대조.md ⓐ#15-19,22-23).
      const rationaleSentence = catalog.get(`ballot:${position.departmentId}`);
      // MINOR 4 (review report): throwing here, instead of degrading
      // further, is deliberate and matches the file's existing convention,
      // not a new failure mode. chairSynthesisInput.ts always emits
      // `position:<dept>` and `ballot:<dept>` together for every
      // department (loader invariant) — if this ever fires, the loader
      // itself is broken, which no amount of local text substitution can
      // honestly paper over. Every `chair_v3_`-prefixed throw in this file
      // is caught by chairSynthesisHandler.ts's outer catch and surfaced as
      // a structured `projection_failed` outcome (logged via
      // `chair_projection_failed`, tested by "retains an irreparable
      // projection error without relaunching the chair") — the run ends
      // without publishing, but the process does not crash and no model
      // launch is wasted retrying a defect retrying can't fix.
      if (rationaleSentence === undefined)
        throw new TypeError("chair_v3_fallback_rationale_missing");
      return {
        departmentId: position.departmentId,
        position: textFor(sentence),
        rationale: textFor(rationaleSentence),
        vote:
          prompt.ballots.find(
            (ballot) => ballot.departmentId === position.departmentId,
          )?.vote ?? "abstain",
        lineage:
          sentence.sentenceId === rationaleSentence.sentenceId
            ? lineageFor(sentence)
            : {
                sentenceIds: [
                  ...new Set([
                    sentence.sentenceId,
                    rationaleSentence.sentenceId,
                  ]),
                ],
                claimIds: [
                  ...new Set([
                    ...sentence.claimIds,
                    ...rationaleSentence.claimIds,
                  ]),
                ],
                sourceArtifactIds: [
                  ...new Set([
                    ...sentence.sourceArtifactIds,
                    ...rationaleSentence.sourceArtifactIds,
                  ]),
                ],
              },
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
  const degraded = locallyDegrade(fallback);
  // MAJOR 1: the schema parse below never checked distinctness, so a
  // position==rationale duplicate the gate in synthesizeChairV3 rejected
  // could come right back from this very fallback (see
  // repairIndistinctFallbackTeamView above for the two concrete ways that
  // happens). Repair before parsing, not after.
  const repairedTeamViews = degraded.teamViews.map((view) =>
    repairIndistinctFallbackTeamView(view, prompt.sentences, prompt.mandate.locale),
  );
  const result = ChairSynthesisV3ModelOutputSchema.parse({
    ...degraded,
    teamViews: repairedTeamViews,
    publicationReductionReasons: [
      ...new Set([
        ...(degraded.publicationReductionReasons ?? []),
        "deterministic_fallback" as const,
      ]),
    ],
  });
  // Defense in depth: if a future edit reintroduces a duplicate through
  // some path the repair above doesn't cover, fail loud here rather than
  // publish it. Same distinctness check the model-output gate uses.
  assertTeamViewsPositionRationaleDistinct(result);
  return result;
}

// position/rationale must be substantively distinct per team view (trim
// basis). The prompt already instructs this (chairSynthesisPrompts.ts
// ~L549), but nothing enforced it: 10 of the 23 archived duplicate pairs
// traced back to the model simply ignoring that instruction
// (quality/2026-09-07-teamviews-원본대조.md ⓐ#1-2,4-11). This is a plain
// function check, not a `ChairSynthesisV3ModelOutputSchema` refine
// (= `ChairSynthesisV3RawModelOutputSchema` = `ChairSynthesisV3Canonical
// NarrativeSchema` in domain/chairSynthesisOutput.ts — one schema under
// three names), on purpose: that schema is reused for structurally
// unrelated things this rule shouldn't apply to — this file's own
// deterministic-fallback construction, JSON-schema generation for the model
// prompt (chairSynthesisContracts.ts), report.ts's publish-time projection
// (workflowV3ReportFromCanonicalNarrative, *not* the render/re-serve path —
// that goes through a separate CanonicalTeamViewSchema in report.ts and
// never touches this schema), and a wide set of test fixtures across this
// file's and other files' test suites that intentionally use degenerate
// teamViews for unrelated assertions. Scoping the check to this one
// function keeps it targeted at the actual boundary this task is about:
// newly generated chair model output, checked once, right where it enters.
export function chairV3TeamViewDuplicateDepartmentId(
  canonical: RawOutput,
): string | undefined {
  return canonical.teamViews.find(
    (view) => view.position.trim() === view.rationale.trim(),
  )?.departmentId;
}

function assertTeamViewsPositionRationaleDistinct(canonical: RawOutput): void {
  const departmentId = chairV3TeamViewDuplicateDepartmentId(canonical);
  if (departmentId !== undefined)
    throw new TypeError(
      `chair_v3_team_view_position_rationale_duplicate:${departmentId}`,
    );
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
  const output = ChairSynthesisV3ModelOutputSchema.parse(
    locallyDegrade(initial),
  );
  // Catches both the model emitting position==rationale directly and
  // `locallyDegrade` collapsing both fields onto the same replacement text
  // when a view's position and rationale both contain a direct-order
  // imperative. Thrown here, this is caught by
  // chairSynthesisHandler.ts's existing `synthesizeChairV3` call site, which
  // — same as any other post-launch model-output defect — falls back to
  // `deterministicChairV3Fallback` instead of terminating the run.
  assertTeamViewsPositionRationaleDistinct(output);
  return output;
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
  const publicationReductionReasons = new Set<PublicationReductionReason>(
    canonical.publicationReductionReasons ?? [],
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
    if (
      authenticated.length !== lineage.sentenceIds.length ||
      retained[0]?.sentenceId !== lineage.sentenceIds[0]
    )
      publicationReductionReasons.add("grounding_rewrite");
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
      .filter((item) => {
        const retained = item.lineage.sentenceIds.some((sentenceId) =>
          catalog.has(sentenceId),
        );
        if (!retained)
          publicationReductionReasons.add("anticipated_question_omission");
        return retained;
      })
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
  const grounded = (
    text: string,
    lineage: Lineage,
    avoidText?: string,
  ): string => {
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
    const normalized = normalizeReaderFacingPrecision(text);
    const localized = { en: normalized, ko: normalized };
    return publicTextIsValid(
      localized,
      sentences,
      4_000,
      canonical.sourceLocale,
    )
      ? normalized
      : (() => {
          publicationReductionReasons.add("grounding_rewrite");
          // MAJOR 2: position and rationale share one `lineage`, so this
          // fallback used to pick `sentences[0]` for both independently —
          // reproducing the exact defect this whole change set removes,
          // just one stage later than the archived duplicates. When the
          // caller passes the sibling field's already-computed text,
          // prefer any other referenced sentence over reusing that exact
          // text. If none exists, `sentences[0]` is the only honest option
          // left — accepted, not fabricated around.
          const preferred =
            avoidText === undefined
              ? sentences[0]
              : (sentences.find(
                  (sentence) =>
                    sentence.text[canonical.sourceLocale].trim() !==
                    avoidText.trim(),
                ) ?? sentences[0]);
          return normalizeReaderFacingPrecision(
            preferred?.text[canonical.sourceLocale] ?? text,
          );
        })();
  };
  const authoritativeStance =
    directional.stance === "wait_for_proof" ? "balanced" : directional.stance;
  const stanceConflict = canonical.stance !== authoritativeStance;
  if (stanceConflict) publicationReductionReasons.add("stance_reconciliation");
  const normalizedCanonical: RawOutput = {
    ...canonicalWithAuthenticatedLineage,
    stance: authoritativeStance,
    decisiveReason: stanceConflict
      ? normalizeReaderFacingPrecision(
          directional.decisive.text[canonical.sourceLocale],
        )
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
    teamViews: canonicalWithAuthenticatedLineage.teamViews.map((view) => {
      const position = grounded(view.position, view.lineage);
      const rationale = grounded(view.rationale, view.lineage, position);
      // Residual case the avoidText preference above can't reach: both
      // fields were already valid as-is (no rewrite triggered) yet still
      // collapsed to the same string, e.g. two inputs differing only in
      // numeric precision that normalizeReaderFacingPrecision rounds to
      // one value. No distinct source exists to substitute — flag it
      // through the same channel every other publication-time compromise
      // in this function uses rather than fabricate a fix or fail the run.
      if (
        rationale.trim() === position.trim() &&
        !publicationReductionReasons.has("grounding_rewrite")
      )
        publicationReductionReasons.add("grounding_rewrite");
      return { ...view, position, rationale };
    }),
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
    publicationReductionReasons: [...publicationReductionReasons],
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
  const parsed = ChairSynthesisOutputSchema.safeParse(committed);
  if (!parsed.success) {
    const issue = chairCandidateIssue(
      validationPrompt,
      projection.candidate,
      true,
    );
    throw new TypeError(
      `chair_v3_grounding_failed:${issue?.reason ?? "invalid_output_schema"}`,
    );
  }
  return ChairSynthesisOutputSchema.parse({
    ...parsed.data,
    canonicalNarrativeV3: normalizedCanonical,
  });
}

import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import {
  containsCapabilityLeakage,
  containsForbiddenPublicVocabulary,
  containsGenericLimitationLanguage,
  containsNumericDump,
  meaningfullyRepeats,
  normalizeEditorialText,
  textSimilarity,
} from "../domain/editorialQuality";
import {
  CHAIR_PROSE_REWRITE_REASONS,
  CHAIR_SECTION_ALLOWED_KINDS,
  CHAIR_SECTION_KEYS,
  ChairSectionRewriteSchema,
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import {
  chairDirectionalBriefAssignment,
  chairSectionPrimaryAssignments,
} from "./chairSynthesisPrompts";
import {
  decisionTextsAreDistinct,
  isSymmetricHedge,
  publicTextIsValid,
} from "./chairSynthesisTextValidation";

type ChairSectionKey = (typeof CHAIR_SECTION_KEYS)[number];
type ChairPrompt = ReturnType<typeof ChairSynthesisPromptSchema.parse>;
type ModelCandidate = ReturnType<typeof ChairSynthesisModelOutputSchema.parse>;

const PROSE_REWRITE_REASONS = new Set<string>(CHAIR_PROSE_REWRITE_REASONS);
const NON_BLOCKING_AFTER_REWRITE = new Set<string>([
  "low_information_summary",
  "numeric_dump_without_interpretation",
  "generic_limitation_language",
  "semantic_repetition",
]);

export type ChairAssignmentProjection = {
  readonly candidate: ModelCandidate;
  readonly projectionHash: string;
};

export type ChairCandidateIssue = {
  readonly sectionKey: ChairSectionKey;
  readonly reason: string;
};

function normalizedModelCandidate(raw: unknown): unknown {
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!parsed.success) return raw;
  const record = parsed.data;
  if (!Array.isArray(record["sections"])) return raw;
  return {
    kind: record["kind"],
    decisionBrief: record["decisionBrief"],
    selectedUnknownIds: record["selectedUnknownIds"],
    sections: record["sections"].map((section) => {
      const parsedSection = z
        .record(z.string(), z.unknown())
        .safeParse(section);
      if (!parsedSection.success) return section;
      const value = parsedSection.data;
      return {
        sectionKey: value["sectionKey"],
        publicSummary: value["publicSummary"],
        primarySentenceId: value["primarySentenceId"],
        sentenceIds: value["sentenceIds"],
        conflictAdjudication: value["conflictAdjudication"] ?? null,
      };
    }),
  };
}

function evidenceDerivedConfidence(
  prompt: ChairPrompt,
): "high" | "medium" | "low" {
  const distinctVotes = new Set(prompt.ballots.map((ballot) => ballot.vote))
    .size;
  if (distinctVotes >= 3) return "low";
  if (distinctVotes === 2 || prompt.dissentClaimIds.length > 0) return "medium";
  return "high";
}

function summaryTokenCount(value: string): number {
  return normalizeEditorialText(value).split(" ").filter(Boolean).length;
}

function minimumSummaryTokens(
  prompt: ChairPrompt,
  sectionKey: ChairSectionKey,
  locale: "en" | "ko",
): number {
  const brief = sectionKey === "ten_second_brief";
  const depth = prompt.mandate.researchProfile.analysisDepth;
  if (depth === "core")
    return brief ? (locale === "ko" ? 6 : 8) : locale === "ko" ? 8 : 10;
  if (depth === "deep")
    return brief ? (locale === "ko" ? 10 : 12) : locale === "ko" ? 16 : 20;
  return brief ? (locale === "ko" ? 8 : 10) : locale === "ko" ? 12 : 15;
}

function investmentModelGrounding(prompt: ChairPrompt): readonly {
  readonly text: { readonly en: string; readonly ko: string };
}[] {
  const model = prompt.investmentModel;
  if (model === undefined) return [];
  const currentPrice =
    model.currentPrice === undefined
      ? { en: "", ko: "" }
      : {
          en: `Current price ${model.currentPrice}`,
          ko: `현재가 ${model.currentPrice}`,
        };
  const scenarios = model.scenarios.map((scenario) => ({
    en: [
      scenario.label.en,
      scenario.impliedPrice,
      scenario.returnPercent,
      scenario.requiredMetric.en,
      scenario.requiredValue,
      ...scenario.assumptions.map((assumption) => assumption.en),
    ]
      .filter((value) => value !== undefined && value !== "")
      .join(" "),
    ko: [
      scenario.label.ko,
      scenario.impliedPrice,
      scenario.returnPercent,
      scenario.requiredMetric.ko,
      scenario.requiredValue,
      ...scenario.assumptions.map((assumption) => assumption.ko),
    ]
      .filter((value) => value !== undefined && value !== "")
      .join(" "),
  }));
  return [
    {
      text: {
        en: [
          model.summary.en,
          model.methodNote.en,
          currentPrice.en,
          ...scenarios.map((scenario) => scenario.en),
        ].join(" "),
        ko: [
          model.summary.ko,
          model.methodNote.ko,
          currentPrice.ko,
          ...scenarios.map((scenario) => scenario.ko),
        ].join(" "),
      },
    },
  ];
}

function claimFamilyGrounding(
  prompt: ChairPrompt,
  selected: readonly ChairPrompt["sentences"][number][],
): readonly ChairPrompt["sentences"][number][] {
  const claimIds = new Set(selected.flatMap((sentence) => sentence.claimIds));
  if (claimIds.size === 0) return selected;
  return prompt.sentences.filter(
    (sentence) =>
      selected.some((owned) => owned.sentenceId === sentence.sentenceId) ||
      sentence.claimIds.some((claimId) => claimIds.has(claimId)),
  );
}

function editorialSummaryIssue(
  prompt: ChairPrompt,
  section: ModelCandidate["sections"][number],
  priorSections: readonly ModelCandidate["sections"][number][],
): string | undefined {
  for (const locale of ["en", "ko"] as const) {
    const text = section.publicSummary[locale];
    if (
      containsCapabilityLeakage(text) ||
      containsForbiddenPublicVocabulary(text)
    )
      return "capability_leakage";
    if (containsGenericLimitationLanguage(text))
      return "generic_limitation_language";
    if (containsNumericDump(text)) return "numeric_dump_without_interpretation";
    if (
      prompt.mandate.question !== undefined &&
      summaryTokenCount(text) <
        (section.sentenceIds.length <= 1
          ? locale === "ko"
            ? 5
            : 6
          : minimumSummaryTokens(prompt, section.sectionKey, locale))
    )
      return "low_information_summary";
  }
  const repeated = priorSections
    // The opening brief is intentionally an executive summary of the
    // detailed sections. Comparing every detail section against it turns a
    // consistent conclusion into a false duplicate.
    .filter((prior) => prior.sectionKey !== "ten_second_brief")
    .some((prior) => {
      const enDuplicate =
        textSimilarity(prior.publicSummary.en, section.publicSummary.en, "en")
          .duplicate ||
        meaningfullyRepeats(prior.publicSummary.en, section.publicSummary.en);
      const koDuplicate =
        textSimilarity(prior.publicSummary.ko, section.publicSummary.ko, "ko")
          .duplicate ||
        meaningfullyRepeats(prior.publicSummary.ko, section.publicSummary.ko);
      // A bilingual report is duplicated only when both localized versions
      // repeat the same prior section. Generic investment vocabulary in one
      // language alone is not enough to discard a valid chair synthesis.
      return enDuplicate && koDuplicate;
    });
  if (repeated) return "semantic_repetition";
  return undefined;
}

function projectedDirectionalText(
  candidate: ModelCandidate["decisionBrief"],
  directional: ReturnType<typeof chairDirectionalBriefAssignment>,
): Pick<
  ModelCandidate["decisionBrief"],
  "decisiveReason" | "strongestCountercase" | "falsifier"
> {
  const current = [
    candidate.decisiveReason,
    candidate.strongestCountercase,
    candidate.falsifier,
  ] as const;
  const sources = [
    directional.decisive,
    directional.countercase,
    directional.falsifier,
  ] as const;
  const individuallyValid = current.every((text, index) => {
    const source = sources[index];
    return (
      source !== undefined &&
      publicTextIsValid(text, [source], 360) &&
      !isSymmetricHedge(text)
    );
  });
  const selected =
    individuallyValid && decisionTextsAreDistinct(current)
      ? current
      : sources.map((source) => source.text);
  return {
    decisiveReason: selected[0],
    strongestCountercase: selected[1],
    falsifier: selected[2],
  };
}

export function projectChairAssignments(
  promptJson: string,
  raw: unknown,
): ChairAssignmentProjection | undefined {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const parsed = ChairSynthesisModelOutputSchema.safeParse(
    normalizedModelCandidate(raw),
  );
  if (!parsed.success) return undefined;
  const candidate = parsed.data;
  const assignments = chairSectionPrimaryAssignments(prompt);
  const directional = chairDirectionalBriefAssignment(prompt, assignments);
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const sectionsByKey = new Map(
    candidate.sections.map((section) => [section.sectionKey, section]),
  );
  if (
    sectionsByKey.size !== CHAIR_SECTION_KEYS.length ||
    candidate.sections.length !== CHAIR_SECTION_KEYS.length ||
    new Set(candidate.selectedUnknownIds).size !==
      candidate.selectedUnknownIds.length ||
    candidate.selectedUnknownIds.some(
      (unknownId) => !prompt.unknownIds.includes(unknownId),
    )
  )
    return undefined;
  const modelTypedSentenceIds = new Set([
    candidate.decisionBrief.decisiveSentenceId,
    candidate.decisionBrief.countercaseSentenceId,
    candidate.decisionBrief.falsifierSentenceId,
    ...candidate.decisionBrief.primarySentenceIds,
    ...candidate.sections.flatMap((section) => [
      section.primarySentenceId,
      ...(section.conflictAdjudication?.departmentDecisionSentenceIds ?? []),
      ...(section.conflictAdjudication === null
        ? []
        : [section.conflictAdjudication.reasonSentenceId]),
    ]),
  ]);
  for (const section of candidate.sections) {
    const allowedKinds: readonly string[] =
      CHAIR_SECTION_ALLOWED_KINDS[section.sectionKey];
    for (const sentenceId of section.sentenceIds) {
      const sentence = catalog.get(sentenceId);
      if (sentence === undefined) {
        if (
          !modelTypedSentenceIds.has(sentenceId) &&
          !sentenceId.startsWith("dissent:challenge:")
        )
          return undefined;
        continue;
      }
      if (
        !allowedKinds.includes(sentence.kind) ||
        sentence.claimIds.some(
          (claimId) => !prompt.auditedClaimIds.includes(claimId),
        )
      )
        return undefined;
    }
  }
  const assignmentBySection = new Map(
    assignments.map((assignment) => [assignment.sectionKey, assignment]),
  );
  const assignedPrimaryIds = new Set(
    assignments.map((assignment) => assignment.primarySentenceId),
  );
  const teamConflictDetected =
    new Set(prompt.ballots.map((ballot) => ballot.vote)).size > 1 ||
    prompt.dissentClaimIds.length > 0;
  const nonSupportedPrimaryIds = new Set(
    assignments
      .filter((assignment) => assignment.sectionKey !== "supported_analysis")
      .map((assignment) => assignment.primarySentenceId),
  );
  const requiredPositionSentenceIds = prompt.sentences
    .filter(
      (sentence) =>
        sentence.kind === "position" &&
        !nonSupportedPrimaryIds.has(sentence.sentenceId),
    )
    .map((sentence) => sentence.sentenceId);
  if (teamConflictDetected && requiredPositionSentenceIds.length < 2)
    return undefined;
  const conflictOwnedIds = new Set(
    teamConflictDetected ? requiredPositionSentenceIds : [],
  );
  const projectedSentenceIds = new Set<string>();
  const sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
    const section = sectionsByKey.get(sectionKey);
    const assignment = assignmentBySection.get(sectionKey);
    if (section === undefined || assignment === undefined) return undefined;
    const primary = catalog.get(assignment.primarySentenceId);
    if (
      primary === undefined ||
      primary.claimIds.some(
        (claimId) => !prompt.auditedClaimIds.includes(claimId),
      )
    )
      return undefined;
    const sentenceIds = [
      assignment.primarySentenceId,
      ...(sectionKey === "supported_analysis"
        ? requiredPositionSentenceIds
        : []),
      ...section.sentenceIds.filter(
        (sentenceId) =>
          catalog.has(sentenceId) &&
          !assignedPrimaryIds.has(sentenceId) &&
          !conflictOwnedIds.has(sentenceId),
      ),
    ].filter(
      (sentenceId, index, values) =>
        values.indexOf(sentenceId) === index &&
        !projectedSentenceIds.has(sentenceId),
    );
    for (const sentenceId of sentenceIds) projectedSentenceIds.add(sentenceId);
    return {
      ...section,
      primarySentenceId: assignment.primarySentenceId,
      sentenceIds,
      conflictAdjudication:
        sectionKey === "supported_analysis" && teamConflictDetected
          ? {
              departmentDecisionSentenceIds: requiredPositionSentenceIds,
              resolution:
                directional.stance === "upside_skewed"
                  ? ("upside_dominates" as const)
                  : directional.stance === "downside_skewed"
                    ? ("downside_dominates" as const)
                    : ("proof_required" as const),
              reasonSentenceId: assignment.primarySentenceId,
            }
          : null,
    };
  });
  if (sections.some((section) => section === undefined)) return undefined;
  const projected = ChairSynthesisModelOutputSchema.parse({
    ...candidate,
    decisionBrief: {
      ...candidate.decisionBrief,
      ...projectedDirectionalText(candidate.decisionBrief, directional),
      stance: directional.stance,
      confidence: directional.confidence,
      primaryClaimIds: directional.primaryClaimIds,
      decisiveSentenceId: directional.decisive.sentenceId,
      countercaseSentenceId: directional.countercase.sentenceId,
      falsifierSentenceId: directional.falsifier.sentenceId,
      primarySentenceIds: directional.primarySentenceIds,
    },
    sections,
  });
  return { candidate: projected, projectionHash: hashCanonical(projected) };
}

function issueForCandidate(
  prompt: ChairPrompt,
  candidate: ModelCandidate,
  ignoredEditorialReasons: ReadonlySet<string> = new Set(),
): ChairCandidateIssue | undefined {
  const primaryAssignments = new Map(
    chairSectionPrimaryAssignments(prompt).map((assignment) => [
      assignment.sectionKey,
      assignment,
    ]),
  );
  const directionalAssignment = chairDirectionalBriefAssignment(prompt, [
    ...primaryAssignments.values(),
  ]);
  const teamConflictDetected =
    new Set(prompt.ballots.map((ballot) => ballot.vote)).size > 1 ||
    prompt.dissentClaimIds.length > 0;
  const keys = candidate.sections.map((section) => section.sectionKey);
  for (const sectionKey of CHAIR_SECTION_KEYS) {
    const count = keys.filter((key) => key === sectionKey).length;
    if (count !== 1)
      return {
        sectionKey,
        reason: count === 0 ? "missing_section" : "duplicate_section",
      };
  }
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const ownedSentenceIds = new Set<string>();
  const ownedPrimaryClaimIds = new Set<string>();
  const priorSections: ModelCandidate["sections"][number][] = [];
  for (const section of candidate.sections) {
    if (
      section.primarySentenceId !==
      primaryAssignments.get(section.sectionKey)?.primarySentenceId
    )
      return {
        sectionKey: section.sectionKey,
        reason: "primary_assignment_mismatch",
      };
    if (
      section.sectionKey !== "supported_analysis" &&
      section.conflictAdjudication !== null
    )
      return {
        sectionKey: section.sectionKey,
        reason: "unexpected_conflict_adjudication",
      };
    const allowedKinds: readonly string[] =
      CHAIR_SECTION_ALLOWED_KINDS[section.sectionKey];
    const selected = section.sentenceIds.flatMap((sentenceId) => {
      const sentence = catalog.get(sentenceId);
      return sentence === undefined ? [] : [sentence];
    });
    if (
      selected.length !== section.sentenceIds.length ||
      new Set(section.sentenceIds).size !== section.sentenceIds.length ||
      !section.sentenceIds.includes(section.primarySentenceId) ||
      selected.some((sentence) => !allowedKinds.includes(sentence.kind))
    )
      return {
        sectionKey: section.sectionKey,
        reason: "invalid_sentence_ownership",
      };
    for (const sentence of selected) {
      if (ownedSentenceIds.has(sentence.sentenceId))
        return {
          sectionKey: section.sectionKey,
          reason: "duplicate_sentence_ownership",
        };
      ownedSentenceIds.add(sentence.sentenceId);
      if (
        sentence.claimIds.some(
          (claimId) => !prompt.auditedClaimIds.includes(claimId),
        )
      )
        return {
          sectionKey: section.sectionKey,
          reason: "removed_or_foreign_claim",
        };
    }
    const primary = catalog.get(section.primarySentenceId);
    if (primary === undefined)
      return {
        sectionKey: section.sectionKey,
        reason: "invalid_primary_sentence",
      };
    for (const claimId of primary.claimIds) {
      if (ownedPrimaryClaimIds.has(claimId))
        return {
          sectionKey: section.sectionKey,
          reason: "duplicate_primary_claim_ownership",
        };
      ownedPrimaryClaimIds.add(claimId);
    }
    const claimGrounding = claimFamilyGrounding(prompt, selected);
    const grounding =
      section.sectionKey === "valuation_comparison"
        ? [...claimGrounding, ...investmentModelGrounding(prompt)]
        : claimGrounding;
    if (
      !publicTextIsValid(
        section.publicSummary,
        grounding,
        section.sectionKey === "ten_second_brief" ? 360 : 4_000,
      )
    )
      return {
        sectionKey: section.sectionKey,
        reason: "invalid_bilingual_summary",
      };
    const editorialIssue = editorialSummaryIssue(
      prompt,
      section,
      priorSections,
    );
    if (
      editorialIssue !== undefined &&
      !ignoredEditorialReasons.has(editorialIssue)
    )
      return { sectionKey: section.sectionKey, reason: editorialIssue };
    priorSections.push(section);
    if (section.sectionKey === "supported_analysis") {
      const departmentPositions = selected.filter(
        (sentence) => sentence.kind === "position",
      );
      const joined = {
        en: selected.map((sentence) => sentence.text.en).join(" "),
        ko: selected.map((sentence) => sentence.text.ko).join(" "),
      };
      const adjudication = section.conflictAdjudication;
      const departmentIds = new Set(
        adjudication?.departmentDecisionSentenceIds.flatMap((sentenceId) => {
          const match = /^(?:position|ballot):(.+)$/u.exec(sentenceId);
          return match?.[1] === undefined ? [] : [match[1]];
        }) ?? [],
      );
      if (!teamConflictDetected && adjudication !== null)
        return {
          sectionKey: section.sectionKey,
          reason: "unexpected_conflict_adjudication",
        };
      if (
        teamConflictDetected &&
        (departmentPositions.length < 2 ||
          adjudication === null ||
          departmentIds.size < 2 ||
          adjudication.departmentDecisionSentenceIds.some(
            (sentenceId) => !section.sentenceIds.includes(sentenceId),
          ) ||
          !section.sentenceIds.includes(adjudication.reasonSentenceId) ||
          section.publicSummary.en === joined.en ||
          section.publicSummary.ko === joined.ko)
      )
        return {
          sectionKey: section.sectionKey,
          reason: "team_conflict_not_adjudicated",
        };
    }
  }
  const brief = candidate.sections.find(
    (section) => section.sectionKey === "ten_second_brief",
  );
  if (brief === undefined)
    return { sectionKey: "ten_second_brief", reason: "missing_section" };
  if (
    isSymmetricHedge(candidate.decisionBrief.decisiveReason) ||
    isSymmetricHedge(brief.publicSummary)
  )
    return { sectionKey: "ten_second_brief", reason: "symmetric_hedge" };
  if (candidate.decisionBrief.confidence !== evidenceDerivedConfidence(prompt))
    return {
      sectionKey: "ten_second_brief",
      reason: "confidence_not_evidence_derived",
    };
  const decisionTexts = [
    candidate.decisionBrief.decisiveReason,
    candidate.decisionBrief.strongestCountercase,
    candidate.decisionBrief.falsifier,
  ];
  const roleSentenceIds = [
    candidate.decisionBrief.decisiveSentenceId,
    candidate.decisionBrief.countercaseSentenceId,
    candidate.decisionBrief.falsifierSentenceId,
  ];
  const roleSentences = roleSentenceIds.map((sentenceId) =>
    catalog.get(sentenceId),
  );
  if (
    candidate.decisionBrief.stance !== directionalAssignment.stance ||
    candidate.decisionBrief.confidence !== directionalAssignment.confidence ||
    roleSentenceIds[0] !== directionalAssignment.decisive.sentenceId ||
    roleSentenceIds[1] !== directionalAssignment.countercase.sentenceId ||
    roleSentenceIds[2] !== directionalAssignment.falsifier.sentenceId ||
    JSON.stringify(candidate.decisionBrief.primarySentenceIds) !==
      JSON.stringify(directionalAssignment.primarySentenceIds) ||
    JSON.stringify(candidate.decisionBrief.primaryClaimIds) !==
      JSON.stringify(directionalAssignment.primaryClaimIds) ||
    new Set(roleSentenceIds).size !== roleSentenceIds.length ||
    roleSentences.some((sentence) => sentence === undefined) ||
    roleSentences[0]?.kind !== "claim" ||
    roleSentences[1]?.kind !== "dissent" ||
    roleSentences[2]?.kind !== "change_condition" ||
    candidate.decisionBrief.primarySentenceIds.some(
      (id) => !brief.sentenceIds.includes(id),
    ) ||
    candidate.decisionBrief.primaryClaimIds.some(
      (id) => !prompt.auditedClaimIds.includes(id),
    ) ||
    decisionTexts.some((text, index) => {
      const sentence = roleSentences[index];
      return (
        sentence === undefined || !publicTextIsValid(text, [sentence], 360)
      );
    })
  )
    return {
      sectionKey: "ten_second_brief",
      reason: "invalid_directional_brief",
    };
  if (!decisionTextsAreDistinct(decisionTexts))
    return {
      sectionKey: "ten_second_brief",
      reason: "decision_components_not_distinct",
    };
  if (
    new Set(candidate.selectedUnknownIds).size !==
      candidate.selectedUnknownIds.length ||
    candidate.selectedUnknownIds.some((id) => !prompt.unknownIds.includes(id))
  )
    return {
      sectionKey: "dissent_unknowns",
      reason: "invalid_unknown_selection",
    };
  return undefined;
}

function resolvedCandidate(
  prompt: ChairPrompt,
  candidate: ModelCandidate,
  ignoredEditorialReasons: ReadonlySet<string> = new Set(),
): unknown {
  const issue = issueForCandidate(prompt, candidate, ignoredEditorialReasons);
  if (issue !== undefined) return {};
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const sections = candidate.sections.map((section) => {
    const selected = section.sentenceIds.flatMap((id) => {
      const sentence = catalog.get(id);
      return sentence === undefined ? [] : [sentence];
    });
    return {
      sectionId: section.sectionKey,
      sectionKey: section.sectionKey,
      publicSummary: section.publicSummary,
      primarySentenceId: section.primarySentenceId,
      sentenceIds: section.sentenceIds,
      sourceArtifactIds: [
        ...new Set(selected.flatMap((sentence) => sentence.sourceArtifactIds)),
      ],
      auditedClaimIds: [
        ...new Set(selected.flatMap((sentence) => sentence.claimIds)),
      ],
      ...(section.conflictAdjudication === null
        ? {}
        : { conflictAdjudication: section.conflictAdjudication }),
    };
  });
  const selectedUnknowns = candidate.selectedUnknownIds.flatMap((unknownId) => {
    const sentence = catalog.get(`unknown:${unknownId}`);
    return sentence?.kind === "unknown" ? [sentence.text] : [];
  });
  if (selectedUnknowns.length !== candidate.selectedUnknownIds.length)
    return {};
  return ChairSynthesisOutputSchema.parse({
    kind: "chair_synthesis",
    sourceArtifactIds: prompt.sourceArtifactIds,
    decisionBrief: candidate.decisionBrief,
    sections,
    ballotArtifactIds: prompt.ballots.map((ballot) => ballot.artifactId),
    dissentClaimIds: prompt.dissentClaimIds,
    selectedUnknownIds: candidate.selectedUnknownIds,
    unknowns: selectedUnknowns,
  });
}

export function chairCandidateIssue(
  promptJson: string,
  raw: unknown,
): ChairCandidateIssue | undefined {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const candidate = ChairSynthesisModelOutputSchema.safeParse(
    normalizedModelCandidate(raw),
  );
  if (!candidate.success)
    return { sectionKey: "ten_second_brief", reason: "invalid_model_output" };
  return issueForCandidate(prompt, candidate.data);
}

export function validChairCandidate(promptJson: string, raw: unknown): unknown {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const candidate = ChairSynthesisModelOutputSchema.safeParse(
    normalizedModelCandidate(raw),
  );
  return candidate.success ? resolvedCandidate(prompt, candidate.data) : {};
}

function groundedFallbackText(
  values: readonly string[],
  maxLength: number,
): string {
  let output = "";
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === "") continue;
    const next = output === "" ? trimmed : `${output} ${trimmed}`;
    if (next.length <= maxLength) {
      output = next;
      continue;
    }
    if (output !== "") break;
    const words = value.split(/\s+/u);
    for (const word of words) {
      const candidate = output === "" ? word : `${output} ${word}`;
      if (candidate.length > maxLength) break;
      output = candidate;
    }
    break;
  }
  return output;
}

function safeEvidenceFragments(value: string): string {
  return value
    .split(
      /(?<=[.!?。！？])\s+|[;\n]+|,\s+(?=(?:but|however|while|although|yet|provided|available|supplied)\b)|,\s*(?=(?:다만|하지만|반면|그러나|제공된|현재 자료))/iu,
    )
    .map((fragment) => fragment.trim())
    .filter(
      (fragment) =>
        fragment !== "" &&
        !containsCapabilityLeakage(fragment) &&
        !containsForbiddenPublicVocabulary(fragment) &&
        !containsGenericLimitationLanguage(fragment),
    )
    .join(" ");
}

function groundedFallbackSummary(
  prompt: ChairPrompt,
  section: ModelCandidate["sections"][number],
): { readonly en: string; readonly ko: string } | undefined {
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const orderedIds = [
    section.primarySentenceId,
    ...section.sentenceIds.filter(
      (sentenceId) => sentenceId !== section.primarySentenceId,
    ),
  ];
  const selected = orderedIds.flatMap((sentenceId) => {
    const sentence = catalog.get(sentenceId);
    return sentence === undefined ? [] : [sentence];
  });
  if (selected.length === 0) return undefined;
  const maxLength = section.sectionKey === "ten_second_brief" ? 360 : 4_000;
  const safeSelection = selected
    .map((sentence) => ({
      ...sentence,
      text: {
        en: safeEvidenceFragments(sentence.text.en),
        ko: safeEvidenceFragments(sentence.text.ko),
      },
    }))
    .filter((sentence) => sentence.text.en !== "" && sentence.text.ko !== "");
  if (safeSelection.length === 0) return undefined;
  const grounded =
    section.sectionKey === "supported_analysis" && safeSelection.length > 1
      ? safeSelection.slice(0, 1)
      : safeSelection;
  return {
    en: groundedFallbackText(
      grounded.map((sentence) => sentence.text.en),
      maxLength,
    ),
    ko: groundedFallbackText(
      grounded.map((sentence) => sentence.text.ko),
      maxLength,
    ),
  };
}

export function repairChairCandidate(
  promptJson: string,
  raw: unknown,
  rewriteRaw?: unknown,
): unknown {
  if (rewriteRaw === undefined) return {};
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const candidate = ChairSynthesisModelOutputSchema.safeParse(
    normalizedModelCandidate(raw),
  );
  const rewrite = ChairSectionRewriteSchema.safeParse(rewriteRaw);
  if (!candidate.success || !rewrite.success) return {};
  const issue = issueForCandidate(prompt, candidate.data);
  if (
    issue === undefined ||
    rewrite.data.section.sectionKey !== issue.sectionKey
  )
    return {};
  const originalSection = candidate.data.sections.find(
    (section) => section.sectionKey === issue.sectionKey,
  );
  const rewrittenSection = PROSE_REWRITE_REASONS.has(issue.reason)
    ? originalSection === undefined
      ? undefined
      : {
          // A prose-only rewrite never gets authority over sentence ownership
          // or conflict adjudication. Preserve those trusted fields on the
          // server and consume only the rewritten bilingual leaf.
          ...originalSection,
          publicSummary: rewrite.data.section.publicSummary,
        }
    : rewrite.data.section;
  if (rewrittenSection === undefined) return {};
  const sections = candidate.data.sections.filter(
    (section) => section.sectionKey !== issue.sectionKey,
  );
  const rewrittenCandidate = {
    ...candidate.data,
    sections: [...sections, rewrittenSection],
  };
  const repaired = resolvedCandidate(prompt, rewrittenCandidate);
  if (
    !PROSE_REWRITE_REASONS.has(issue.reason) ||
    typeof repaired !== "object" ||
    repaired === null ||
    Object.keys(repaired).length > 0
  )
    return repaired;
  let fallbackCandidate = rewrittenCandidate;
  for (let index = 0; index < CHAIR_SECTION_KEYS.length; index += 1) {
    const remainingIssue = issueForCandidate(
      prompt,
      fallbackCandidate,
      NON_BLOCKING_AFTER_REWRITE,
    );
    if (remainingIssue === undefined)
      return resolvedCandidate(
        prompt,
        fallbackCandidate,
        NON_BLOCKING_AFTER_REWRITE,
      );
    if (!PROSE_REWRITE_REASONS.has(remainingIssue.reason)) return {};
    const target = fallbackCandidate.sections.find(
      (section) => section.sectionKey === remainingIssue.sectionKey,
    );
    if (target === undefined) return {};
    const fallback = groundedFallbackSummary(prompt, target);
    if (fallback === undefined) return {};
    fallbackCandidate = {
      ...fallbackCandidate,
      sections: fallbackCandidate.sections.map((section) =>
        section.sectionKey === target.sectionKey
          ? { ...section, publicSummary: fallback }
          : section,
      ),
    };
  }
  return resolvedCandidate(
    prompt,
    fallbackCandidate,
    NON_BLOCKING_AFTER_REWRITE,
  );
}

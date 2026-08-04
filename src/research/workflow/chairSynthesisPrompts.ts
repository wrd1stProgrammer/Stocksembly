import {
  CHAIR_PROSE_REWRITE_REASONS,
  CHAIR_SECTION_ALLOWED_KINDS,
  CHAIR_SECTION_KEYS,
  type ChairSynthesisPrompt,
} from "./chairSynthesisContracts";
import { decisionTextsAreDistinct } from "./chairSynthesisTextValidation";

type ChairSectionKey = (typeof CHAIR_SECTION_KEYS)[number];
type ChairSentence = ChairSynthesisPrompt["sentences"][number];

const PRIMARY_KIND_ORDER: Readonly<
  Record<ChairSectionKey, readonly ChairSentence["kind"][]>
> = {
  ten_second_brief: ["claim", "position", "dissent", "change_condition"],
  supported_analysis: ["position", "ballot", "dissent", "claim"],
  valuation_comparison: ["claim", "position"],
  operational_scenarios: ["scenario", "change_condition", "claim"],
  dissent_unknowns: ["unknown", "dissent", "ballot"],
  change_conditions: ["unknown", "change_condition"],
};

export type ChairSectionPrimaryAssignment = {
  readonly sectionKey: ChairSectionKey;
  readonly primarySentenceId: string;
  readonly primaryClaimIds: readonly string[];
};

export type ChairDirectionalBriefAssignment = {
  readonly stance: "upside_skewed" | "wait_for_proof" | "downside_skewed";
  readonly confidence: "high" | "medium" | "low";
  readonly decisive: ChairSentence;
  readonly countercase: ChairSentence;
  readonly falsifier: ChairSentence;
  readonly primarySentenceIds: readonly string[];
  readonly primaryClaimIds: readonly string[];
};

export function chairSectionPrimaryAssignments(
  prompt: ChairSynthesisPrompt,
): readonly ChairSectionPrimaryAssignment[] {
  const search = (
    index: number,
    usedSentenceIds: ReadonlySet<string>,
    usedClaimIds: ReadonlySet<string>,
  ): readonly ChairSectionPrimaryAssignment[] | undefined => {
    const sectionKey = CHAIR_SECTION_KEYS[index];
    if (sectionKey === undefined) return [];
    const allowedKinds: readonly string[] =
      CHAIR_SECTION_ALLOWED_KINDS[sectionKey];
    const kindOrder = PRIMARY_KIND_ORDER[sectionKey];
    const candidates = prompt.sentences
      .filter(
        (sentence) =>
          allowedKinds.includes(sentence.kind) &&
          sentence.claimIds.every((claimId) =>
            prompt.auditedClaimIds.includes(claimId),
          ) &&
          !usedSentenceIds.has(sentence.sentenceId) &&
          sentence.claimIds.every((claimId) => !usedClaimIds.has(claimId)),
      )
      .map((sentence, sentenceIndex) => ({ sentence, sentenceIndex }))
      .sort((left, right) => {
        const leftRank = kindOrder.indexOf(left.sentence.kind);
        const rightRank = kindOrder.indexOf(right.sentence.kind);
        return leftRank - rightRank || left.sentenceIndex - right.sentenceIndex;
      });
    for (const { sentence } of candidates) {
      const remainder = search(
        index + 1,
        new Set([...usedSentenceIds, sentence.sentenceId]),
        new Set([...usedClaimIds, ...sentence.claimIds]),
      );
      if (remainder !== undefined)
        return [
          {
            sectionKey,
            primarySentenceId: sentence.sentenceId,
            primaryClaimIds: sentence.claimIds,
          },
          ...remainder,
        ];
    }
    return undefined;
  };
  const assignments = search(0, new Set(), new Set());
  if (assignments === undefined)
    throw new TypeError("chair_primary_assignment_incomplete");
  return assignments;
}

export function chairDirectionalBriefAssignment(
  prompt: ChairSynthesisPrompt,
  sectionAssignments = chairSectionPrimaryAssignments(prompt),
): ChairDirectionalBriefAssignment {
  const tenSecond = sectionAssignments.find(
    (assignment) => assignment.sectionKey === "ten_second_brief",
  );
  const decisive = prompt.sentences.find(
    (sentence) => sentence.sentenceId === tenSecond?.primarySentenceId,
  );
  const countercaseCandidates = prompt.sentences
    .filter((sentence) => sentence.kind === "dissent")
    // A challenge is a better countercase than an echoed claim. Keep the
    // catalog order as the final tie-breaker so the assignment stays stable.
    .sort(
      (left, right) =>
        Number(right.sentenceId.startsWith("dissent:challenge:")) -
        Number(left.sentenceId.startsWith("dissent:challenge:")),
    );
  const countercase =
    decisive === undefined
      ? countercaseCandidates[0]
      : (countercaseCandidates.find((sentence) =>
          decisionTextsAreDistinct([decisive.text, sentence.text]),
        ) ?? countercaseCandidates[0]);
  const falsifierCandidates = prompt.sentences.filter(
    (sentence) => sentence.kind === "change_condition",
  );
  const falsifier =
    decisive === undefined || countercase === undefined
      ? falsifierCandidates[0]
      : (falsifierCandidates.find((sentence) =>
          decisionTextsAreDistinct([
            decisive.text,
            countercase.text,
            sentence.text,
          ]),
        ) ?? falsifierCandidates[0]);
  if (
    tenSecond === undefined ||
    decisive?.kind !== "claim" ||
    countercase === undefined ||
    falsifier === undefined
  )
    throw new TypeError("chair_directional_assignment_incomplete");
  const votes = prompt.ballots.map((ballot) => ballot.vote);
  const supportCount = votes.filter((vote) => vote === "support").length;
  const opposeCount = votes.filter((vote) => vote === "oppose").length;
  const distinctVotes = new Set(votes).size;
  return {
    stance:
      supportCount === votes.length && prompt.dissentClaimIds.length === 0
        ? "upside_skewed"
        : opposeCount >= 3
          ? "downside_skewed"
          : "wait_for_proof",
    confidence:
      distinctVotes >= 3
        ? "low"
        : distinctVotes === 2 || prompt.dissentClaimIds.length > 0
          ? "medium"
          : "high",
    decisive,
    countercase,
    falsifier,
    primarySentenceIds: [tenSecond.primarySentenceId],
    primaryClaimIds: tenSecond.primaryClaimIds,
  };
}

function groundingTokens(text: string): readonly string[] {
  return [
    ...new Set(
      text.toLocaleLowerCase("und").match(/[\p{L}\p{N}_-]{2,}/gu) ?? [],
    ),
  ].slice(0, 12);
}

function groundedNumbers(text: string): readonly string[] {
  return [
    ...new Set(text.match(/[$€£]?[+-]?\d[\d,.]*(?:%|[A-Za-z])?/gu) ?? []),
  ];
}

export function chairSynthesisModelPrompt(
  prompt: ChairSynthesisPrompt,
): string {
  const targetEvidenceCount =
    prompt.mandate.researchProfile.analysisDepth === "core"
      ? 1
      : prompt.mandate.researchProfile.analysisDepth === "deep"
        ? 4
        : 3;
  const sectionPrimaryAssignments = chairSectionPrimaryAssignments(prompt);
  const directionalAssignment = chairDirectionalBriefAssignment(
    prompt,
    sectionPrimaryAssignments,
  );
  const teamConflictDetected =
    new Set(prompt.ballots.map((ballot) => ballot.vote)).size > 1 ||
    prompt.dissentClaimIds.length > 0;
  const sentenceIdsByKind = (
    kind: ChairSynthesisPrompt["sentences"][number]["kind"],
  ) =>
    prompt.sentences
      .filter((sentence) => sentence.kind === kind)
      .map((sentence) => sentence.sentenceId);
  const supportedAnalysisKinds: readonly string[] =
    CHAIR_SECTION_ALLOWED_KINDS.supported_analysis;
  const positionSentenceIds = sentenceIdsByKind("position");
  const nonSupportedPrimaryIds = new Set(
    sectionPrimaryAssignments
      .filter((assignment) => assignment.sectionKey !== "supported_analysis")
      .map((assignment) => assignment.primarySentenceId),
  );
  const requiredPositionSentenceIds = positionSentenceIds.filter(
    (sentenceId) => !nonSupportedPrimaryIds.has(sentenceId),
  );
  if (teamConflictDetected && requiredPositionSentenceIds.length < 2)
    throw new TypeError("chair_conflict_assignment_incomplete");
  return JSON.stringify({
    kind: prompt.kind,
    mandate: {
      question: prompt.mandate.question,
      scope: prompt.mandate.scope,
      locale: prompt.mandate.locale,
      limitations: prompt.mandate.limitations,
      researchProfile: prompt.mandate.researchProfile,
    },
    evidenceBoundary: "BEGIN_UNTRUSTED_EVIDENCE_CATALOG",
    ballots: prompt.ballots.map(({ departmentId, vote }) => ({
      departmentId,
      vote,
    })),
    unknownIds: prompt.unknownIds,
    sentences: prompt.sentences.map(({ sentenceId, kind, claimIds, text }) => ({
      sentenceId,
      kind,
      claimIds,
      text,
      groundingAllowlist: {
        enTokens: groundingTokens(text.en),
        koTokens: groundingTokens(text.ko),
        enNumbers: groundedNumbers(text.en),
        koNumbers: groundedNumbers(text.ko),
      },
    })),
    ownershipContract: {
      maxSectionsPerSentence: 1,
      ledger: prompt.sentences.map((sentence) => ({
        sentenceId: sentence.sentenceId,
        eligibleSectionKeys: CHAIR_SECTION_KEYS.filter((sectionKey) => {
          const allowedKinds: readonly string[] =
            CHAIR_SECTION_ALLOWED_KINDS[sectionKey];
          return allowedKinds.includes(sentence.kind);
        }),
      })),
    },
    primaryClaimOwnershipContract: {
      maxPrimarySectionsPerClaim: 1,
      ledger: prompt.auditedClaimIds.map((claimId) => {
        const eligiblePrimarySentences = prompt.sentences.filter((sentence) =>
          sentence.claimIds.includes(claimId),
        );
        return {
          claimId,
          eligiblePrimarySentenceIds: eligiblePrimarySentences.map(
            (sentence) => sentence.sentenceId,
          ),
          eligibleSectionKeys: CHAIR_SECTION_KEYS.filter((sectionKey) => {
            const allowedKinds: readonly string[] =
              CHAIR_SECTION_ALLOWED_KINDS[sectionKey];
            return eligiblePrimarySentences.some((sentence) =>
              allowedKinds.includes(sentence.kind),
            );
          }),
        };
      }),
    },
    sectionPrimaryAssignments,
    decisionRoleOwnershipContract: {
      decisiveSentenceIds: sentenceIdsByKind("claim"),
      countercaseSentenceIds: sentenceIdsByKind("dissent"),
      falsifierSentenceIds: sentenceIdsByKind("change_condition"),
    },
    directionalBriefContract: {
      allowedStances: ["upside_skewed", "wait_for_proof", "downside_skewed"],
      requiredStance: directionalAssignment.stance,
      requiredConfidence: directionalAssignment.confidence,
      primarySectionKey: "ten_second_brief",
      allowedPrimaryClaimIds: prompt.auditedClaimIds,
      roles: {
        decisive: {
          allowedSentenceIds: sentenceIdsByKind("claim"),
          assignedSentenceId: directionalAssignment.decisive.sentenceId,
          canonicalText: directionalAssignment.decisive.text,
          textConstruction:
            "Write a concise directional conclusion grounded in the assigned sentence. Do not copy it verbatim; explain what the evidence means for the selected horizon and decision purpose without adding facts or numbers.",
        },
        countercase: {
          allowedSentenceIds: sentenceIdsByKind("dissent"),
          assignedSentenceId: directionalAssignment.countercase.sentenceId,
          canonicalText: directionalAssignment.countercase.text,
          textConstruction:
            "State the strongest decision-changing opposing case in your own words. Preserve the evidence meaning and numbers; do not soften it into generic balance language.",
        },
        falsifier: {
          allowedSentenceIds: sentenceIdsByKind("change_condition"),
          assignedSentenceId: directionalAssignment.falsifier.sentenceId,
          canonicalText: directionalAssignment.falsifier.text,
          textConstruction:
            "Turn the assigned change condition into one observable invalidation rule. Do not copy the source sentence verbatim and do not invent a threshold.",
        },
      },
      requiredPrimarySentenceIds: directionalAssignment.primarySentenceIds,
      requiredPrimaryClaimIds: directionalAssignment.primaryClaimIds,
      distinctRoleSentenceIds: true,
      forbiddenHedgeClassifierCodes: ["symmetric_hedge"],
    },
    teamConflictContract: {
      detected: teamConflictDetected,
      targetSectionKey: "supported_analysis",
      conflictAdjudicationRequired: teamConflictDetected,
      allowedDepartmentDecisionSentenceIds: prompt.sentences
        .filter(
          (sentence) =>
            sentence.kind === "position" || sentence.kind === "ballot",
        )
        .map((sentence) => sentence.sentenceId),
      requiredOwnedPositionSentenceIds: teamConflictDetected
        ? requiredPositionSentenceIds
        : [],
      requiredDepartmentDecisionSentenceIds: teamConflictDetected
        ? requiredPositionSentenceIds
        : [],
      reasonSentenceRule: teamConflictDetected
        ? "use_primarySentenceId"
        : "not_applicable",
      allowedReasonSentenceIds: prompt.sentences
        .filter((sentence) => supportedAnalysisKinds.includes(sentence.kind))
        .map((sentence) => sentence.sentenceId),
      nullSectionKeys: CHAIR_SECTION_KEYS.filter(
        (sectionKey) =>
          sectionKey !== "supported_analysis" || !teamConflictDetected,
      ),
    },
    publicSummaryContract: {
      english:
        "Use Latin-script English grounded in the selected sentences' English text. Use at least one exact grounding token and only numbers from the selected evidence. Synthesize meaning; never paste a source sentence as the whole section.",
      korean:
        "Use natural Hangul-script Korean grounded in the selected Korean evidence. Use at least one exact grounding token and only selected numbers. Synthesize meaning; never paste a source sentence as the whole section.",
      crossLocale:
        "English and Korean must be substantive localized counterparts, never normalized copies or transliterations.",
      maxCharacters: {
        ten_second_brief: 360,
        otherSections: 4000,
      },
    },
    sectionContracts: CHAIR_SECTION_KEYS.map((sectionKey) => ({
      sectionKey,
      allowedKinds: CHAIR_SECTION_ALLOWED_KINDS[sectionKey],
      targetDistinctEvidenceSentences:
        sectionKey === "ten_second_brief"
          ? Math.min(2, targetEvidenceCount)
          : targetEvidenceCount,
      publicSummaryConstruction: `Write one cohesive editorial paragraph from the owned sentenceIds. The paragraph must contain a directional judgment, the evidence mechanism, the strongest relevant counterpoint, and the investor implication or observable change condition. ${
        prompt.mandate.researchProfile.analysisDepth === "core"
          ? "Use 2-3 concise sentences and keep only the decisive signal."
          : prompt.mandate.researchProfile.analysisDepth === "deep"
            ? "Use 4-6 substantive sentences and connect at least three distinct evidence signals when available."
            : "Use 3-5 substantive sentences and connect at least two distinct evidence signals when available."
      } Omit a component only when that section's allowed evidence kinds cannot support it. Never disguise weak prose with a fixed label, prefix, suffix, synonym swap, or generic data-availability caveat. Interpret every number cluster through a comparison, mechanism, or decision consequence. Do not repeat the same conclusion, metric bundle, or caveat used by another section.`,
      ...(sectionKey === "supported_analysis"
        ? {
            requiresConflictAdjudication: teamConflictDetected
              ? "Non-null. Own every requiredOwnedPositionSentenceId in this section, set departmentDecisionSentenceIds exactly to requiredDepartmentDecisionSentenceIds, choose a resolution, and set reasonSentenceId exactly to this section's primarySentenceId."
              : "Null because no team conflict was detected in the audited ballots or dissent ledger.",
          }
        : {}),
    })),
    evidenceBoundaryEnd: "END_UNTRUSTED_EVIDENCE_CATALOG",
    editorialDirection: {
      horizon: prompt.mandate.researchProfile.investmentHorizon,
      decisionPurpose: prompt.mandate.researchProfile.decisionPurpose,
      counterargumentIntensity:
        prompt.mandate.researchProfile.counterargumentIntensity,
      comparisonSymbols: prompt.mandate.researchProfile.comparisonSymbols,
      requirements: [
        "Convert evidence into a decision, not a meeting recap.",
        "For short horizon, prioritize the next catalyst, price/estimate direction, and a near-term invalidation signal; do not let long-run optionality dominate the conclusion.",
        "For medium horizon, prioritize the next two-to-four reporting periods, estimate revisions, operating execution, and the valuation path required over that window.",
        "For long horizon, prioritize durable demand, competitive advantage, reinvestment economics, balance-sheet endurance, and the conditions that would erode compounding.",
        "For new_entry, state entry prerequisites and the valuation or proof the investor is being asked to accept.",
        "For holding_review, separate thesis intact, thesis weakened, and exit/reassess conditions.",
        "For position_sizing, state which asymmetry or concentration condition argues for adding, maintaining, or reducing exposure without issuing a personalized trade command.",
        "For earnings, distinguish what is known before the release, the decisive reported metric, and the post-release interpretation using the calendar, estimates, and filing evidence supplied to specialists.",
        "When counterargumentIntensity is strong, make the countercase concrete and material; the final stance must still favor the better-supported side.",
      ],
    },
    instructions: `${prompt.instructions} Set every section primarySentenceId exactly from sectionPrimaryAssignments and do not substitute or clone an assignment; the attached primaryClaimIds are exclusively owned by that section. Follow publicSummaryContract and each section's publicSummaryConstruction exactly. Each sentenceId may be owned by at most one section and must appear only in a section listed by ownershipContract. Follow directionalBriefContract exactly: use requiredStance, requiredConfidence, requiredPrimarySentenceIds, and requiredPrimaryClaimIds, but write the three public decision texts as grounded synthesis rather than copies. Follow teamConflictContract exactly: when detected, supported_analysis.conflictAdjudication is non-null and all of its IDs must come from the allowed ledgers and be owned by supported_analysis; every section named in nullSectionKeys must return conflictAdjudication null.`,
  });
}

export function chairSectionRewritePrompt(input: {
  readonly prompt: ChairSynthesisPrompt;
  readonly sectionKey: (typeof CHAIR_SECTION_KEYS)[number];
  readonly reason: string;
  readonly excludedSentenceIds?: readonly string[];
  readonly originalSection?: {
    readonly primarySentenceId: string;
    readonly sentenceIds: readonly string[];
    readonly conflictAdjudication: unknown;
  };
}): string {
  const allowedKinds: readonly string[] =
    CHAIR_SECTION_ALLOWED_KINDS[input.sectionKey];
  const excluded = new Set(input.excludedSentenceIds ?? []);
  const proseOnly =
    (CHAIR_PROSE_REWRITE_REASONS as readonly string[]).includes(input.reason) &&
    input.originalSection !== undefined;
  const preservedIds = new Set(input.originalSection?.sentenceIds ?? []);
  const sentences = input.prompt.sentences.filter((sentence) =>
    proseOnly
      ? preservedIds.has(sentence.sentenceId)
      : allowedKinds.includes(sentence.kind) &&
        !excluded.has(sentence.sentenceId),
  );
  const primaryAssignments = chairSectionPrimaryAssignments(input.prompt);
  const requiredPrimaryAssignment = primaryAssignments.find(
    (assignment) => assignment.sectionKey === input.sectionKey,
  );
  if (requiredPrimaryAssignment === undefined)
    throw new TypeError("chair_primary_assignment_incomplete");
  const teamConflictDetected =
    new Set(input.prompt.ballots.map((ballot) => ballot.vote)).size > 1 ||
    input.prompt.dissentClaimIds.length > 0;
  const requiredPositionSentenceIds = input.prompt.sentences
    .filter(
      (sentence) =>
        sentence.kind === "position" &&
        !primaryAssignments.some(
          (assignment) =>
            assignment.sectionKey !== "supported_analysis" &&
            assignment.primarySentenceId === sentence.sentenceId,
        ),
    )
    .map((sentence) => sentence.sentenceId);
  return JSON.stringify({
    kind: "chair_section_rewrite_request",
    target: {
      sectionKey: input.sectionKey,
      field: proseOnly ? "publicSummary" : "section",
    },
    reason: input.reason,
    permitted: {
      sentenceIds: sentences.map((sentence) => sentence.sentenceId),
      claimIds: input.prompt.auditedClaimIds,
      sourceArtifactIds: input.prompt.sourceArtifactIds,
    },
    requiredPrimaryAssignment,
    requiredConflictAdjudication:
      input.sectionKey === "supported_analysis" && teamConflictDetected
        ? {
            departmentDecisionSentenceIds: requiredPositionSentenceIds,
            reasonSentenceId: requiredPrimaryAssignment.primarySentenceId,
          }
        : null,
    ...(proseOnly
      ? {
          preserve: {
            primarySentenceId: input.originalSection?.primarySentenceId,
            sentenceIds: input.originalSection?.sentenceIds,
            conflictAdjudication:
              input.originalSection?.conflictAdjudication ?? null,
          },
        }
      : {}),
    evidenceBoundary: "BEGIN_UNTRUSTED_EVIDENCE_CATALOG",
    sentences: sentences.map(({ sentenceId, kind, claimIds, text }) => ({
      sentenceId,
      kind,
      claimIds,
      text,
    })),
    evidenceBoundaryEnd: "END_UNTRUSTED_EVIDENCE_CATALOG",
    editorialDirection: {
      horizon: input.prompt.mandate.researchProfile.investmentHorizon,
      decisionPurpose: input.prompt.mandate.researchProfile.decisionPurpose,
      counterargumentIntensity:
        input.prompt.mandate.researchProfile.counterargumentIntensity,
      analysisDepth: input.prompt.mandate.researchProfile.analysisDepth,
      comparisonSymbols: input.prompt.mandate.researchProfile.comparisonSymbols,
    },
    instructions: proseOnly
      ? `Rewrite only publicSummary and preserve primarySentenceId, sentenceIds, and conflictAdjudication exactly. Do not patch the old wording with a label, prefix, suffix, synonym swap, or generic caveat; rebuild the thought from the preserved evidence. ${
          input.prompt.mandate.researchProfile.analysisDepth === "core"
            ? "Use 2-3 concise sentences: directional judgment, decisive evidence, and investor implication or change condition."
            : input.prompt.mandate.researchProfile.analysisDepth === "deep"
              ? "Use 4-6 substantive sentences: directional judgment, at least three distinct evidence signals when available, mechanism, strongest counterpoint, and investor implication or observable change condition."
              : "Use 3-5 substantive sentences: directional judgment, at least two distinct evidence signals when available, strongest counterpoint, and investor implication or observable change condition."
        } A number cluster must be followed by comparison or interpretation. Never write a generic statement that data is unavailable; if a missing metric is decision-material, name the metric, explain how its absence changes confidence, and state the event that resolves it. English must use Latin-language grounding from the selected English evidence; Korean must use Hangul-language grounding from the selected Korean evidence. The two leaves must not be normalized copies or transliterations. Do not add IDs or numbers outside the preserved evidence. Return only chair_section_rewrite JSON.`
      : "Rewrite exactly the named section as one cohesive editorial paragraph. Lead with a directional judgment, explain the evidence mechanism, confront the strongest material counterpoint, then state the investor implication or observable change condition for the supplied horizon and decision purpose. Synthesize the evidence instead of copying the primary sentence verbatim. Avoid repeating a conclusion, metric bundle, or caveat already used elsewhere. Return only chair_section_rewrite JSON. Do not add IDs or numbers outside the permitted catalog.",
  });
}

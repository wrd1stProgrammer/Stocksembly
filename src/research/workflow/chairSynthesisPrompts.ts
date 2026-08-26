import {
  explanationModeOf,
  publicExplanationPolicy,
  type ResearchProfile,
} from "../domain/researchProfile";
import {
  CHAIR_PROSE_REWRITE_REASONS,
  CHAIR_SECTION_ALLOWED_KINDS,
  CHAIR_SECTION_KEYS,
  type ChairSynthesisPrompt,
} from "./chairSynthesisContracts";
import {
  decisionTextsAreDistinct,
  publicTextIsValid,
} from "./chairSynthesisTextValidation";

type ChairSectionKey = (typeof CHAIR_SECTION_KEYS)[number];
type ChairSentence = ChairSynthesisPrompt["sentences"][number];

function explanationInstruction(profile: ResearchProfile): string {
  return explanationModeOf(profile) === "easy"
    ? "Write public summaries for a first-time investor: lead with the conclusion, define specialized finance terms at first use, explain why each important number matters, and prefer short direct sentences. Preserve every analytical distinction, uncertainty, and citation boundary."
    : "Use a concise professional finance register and explain the decision relevance of important numbers.";
}

const PRIMARY_KIND_ORDER: Readonly<
  Record<ChairSectionKey, readonly ChairSentence["kind"][]>
> = {
  ten_second_brief: ["claim", "position", "dissent", "change_condition"],
  supported_analysis: ["position", "ballot", "dissent", "claim"],
  valuation_comparison: ["claim", "position", "scenario"],
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
    .filter(
      (sentence) =>
        sentence.kind === "dissent" &&
        publicTextIsValid(
          sentence.text,
          [sentence],
          360,
          prompt.mandate.locale,
        ),
    )
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
    (sentence) =>
      sentence.kind === "change_condition" &&
      publicTextIsValid(sentence.text, [sentence], 360, prompt.mandate.locale),
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

function sectionEditorialRole(sectionKey: ChairSectionKey): string {
  switch (sectionKey) {
    case "ten_second_brief":
      return "Answer mandate.question directly in the first sentence. State the directional conclusion for the selected horizon and decision purpose, then identify the one fact or event that makes the answer actionable. Do not lead with a data limitation unless the question itself is a relative-comparison question.";
    case "supported_analysis":
      return "Act as a claim audit, not a second executive summary. Separate what is established, what remains disputed across teams, and the investor checkpoint that resolves the dispute. Do not repeat the ten-second conclusion.";
    case "valuation_comparison":
      return "Translate price, estimates, and qualified comparisons into an explicit earnings or operating hurdle. Label provider aggregates as market estimates, not verified outcomes. When no qualified peer exists, use absolute valuation evidence without making peer absence the paragraph's thesis.";
    case "operational_scenarios":
      return "Describe distinct operating paths and connect each path to a measurable investor consequence over the selected horizon. Do not recap the valuation section or the committee stance.";
    case "dissent_unknowns":
      return "Preserve only the strongest decision-changing dissent and the unresolved fact that matters. Explain why resolving it would change the investment interpretation.";
    case "change_conditions":
      return "Write observable decision rules: the result that strengthens the case, the result that weakens it, and the next event where those results can be checked. Avoid generic calls for more data.";
  }
}

function sectionPublicSummaryConstruction(
  sectionKey: ChairSectionKey,
  depth: ChairSynthesisPrompt["mandate"]["researchProfile"]["analysisDepth"],
): string {
  const length =
    depth === "core"
      ? "Use 2-3 concise sentences."
      : depth === "deep"
        ? "Use 4-6 substantive sentences."
        : "Use 3-5 substantive sentences.";
  const contract: Record<ChairSectionKey, string> = {
    ten_second_brief:
      "Lead with the direct answer, then explain the decisive mechanism and what it means for the selected horizon and decision purpose. Do not append the countercase, a data caveat, or a generic wait-for-more-proof sentence; those belong to later sections.",
    supported_analysis:
      "Organize the owned evidence into three distinct jobs: what is established, what the teams genuinely dispute, and the single checkpoint that resolves the dispute. Do not restate the verdict or recycle the same metric bundle from the opening.",
    valuation_comparison:
      "State the observed valuation or market expectation, the operating result required to justify it, and the consequence if delivery is above or below that hurdle. For comparative mandates, name both companies and explain the price-versus-quality trade-off.",
    operational_scenarios:
      "Describe distinct base, upside, and downside operating paths only when owned evidence supports them. Each path must have a different mechanism and investor consequence; do not recap valuation or committee language.",
    dissent_unknowns:
      "Present only the strongest decision-changing opposing case and explain precisely why it could overturn the current interpretation. Do not create symmetrical caution or list generic uncertainties.",
    change_conditions:
      "Write observable rules for strengthening, weakening, and rechecking the decision. Use a dated event or measurable filing result when present, and do not repeat the current verdict.",
  };
  return `${sectionEditorialRole(sectionKey)} ${contract[sectionKey]} ${length} Omit unsupported detail instead of filling space with a limitation. Never reuse another section's conclusion sentence, metric bundle, caveat, or closing sentence.`;
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
    investmentModel: prompt.investmentModel,
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
      explanationPolicy: publicExplanationPolicy(
        prompt.mandate.researchProfile,
      ),
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
      publicSummaryConstruction: sectionPublicSummaryConstruction(
        sectionKey,
        prompt.mandate.researchProfile.analysisDepth,
      ),
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
      explanationMode: explanationModeOf(prompt.mandate.researchProfile),
      comparisonSymbols: prompt.mandate.researchProfile.comparisonSymbols,
      requirements: [
        explanationInstruction(prompt.mandate.researchProfile),
        "The report must answer mandate.question rather than merely describe the company. Reuse the question's subject, not its wording, and make the relevance explicit in the ten-second brief and one supporting section only.",
        "Convert evidence into a decision, not a meeting recap.",
        "For short horizon, prioritize the next catalyst, price/estimate direction, and a near-term invalidation signal; do not let long-run optionality dominate the conclusion.",
        "For medium horizon, prioritize the next two-to-four reporting periods, estimate revisions, operating execution, and the valuation path required over that window.",
        "For long horizon, prioritize durable demand, competitive advantage, reinvestment economics, balance-sheet endurance, and the conditions that would erode compounding.",
        "For new_entry, state entry prerequisites and the valuation or proof the investor is being asked to accept.",
        "For holding_review, separate thesis intact, thesis weakened, and exit/reassess conditions.",
        "For position_sizing, state which asymmetry or concentration condition argues for adding, maintaining, or reducing exposure without issuing a personalized trade command.",
        "For earnings, distinguish what is known before the release, the decisive reported metric, and the post-release interpretation using the calendar, estimates, and filing evidence supplied to specialists.",
        "When counterargumentIntensity is strong, make the countercase concrete and material; the final stance must still favor the better-supported side.",
        ...(prompt.investmentModel === undefined
          ? []
          : [
              "Use investmentModel only as a transparent sensitivity framework. In valuation_comparison, distinguish its modeled range from the separate consensus target, name the selected method, and state the operating or multiple assumption that creates the widest downside. Do not present the range as a guaranteed fair value.",
            ]),
        ...(prompt.mandate.researchProfile.comparisonSymbols.length > 0
          ? [
              `This is a direct comparison against ${prompt.mandate.researchProfile.comparisonSymbols.join(", ")}. The ten-second brief must name the subject and comparator and choose the stronger fit for the selected horizon and decision purpose. supported_analysis must explain the operating or competitive reason for that choice; valuation_comparison must separately explain the price-and-expectations trade-off. Do not answer with a broad peer-data caveat when qualified evidence for the named comparator is present.`,
            ]
          : []),
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
      explanationMode: explanationModeOf(input.prompt.mandate.researchProfile),
      explanationPolicy: publicExplanationPolicy(
        input.prompt.mandate.researchProfile,
      ),
      comparisonSymbols: input.prompt.mandate.researchProfile.comparisonSymbols,
    },
    instructions: proseOnly
      ? `Rewrite only publicSummary and preserve primarySentenceId, sentenceIds, and conflictAdjudication exactly. Do not patch the old wording with a label, prefix, suffix, synonym swap, or generic caveat; rebuild the thought from the preserved evidence. ${sectionPublicSummaryConstruction(input.sectionKey, input.prompt.mandate.researchProfile.analysisDepth)} ${explanationInstruction(input.prompt.mandate.researchProfile)} A number cluster must be followed by comparison or interpretation. English must use Latin-language grounding from the selected English evidence; Korean must use Hangul-language grounding from the selected Korean evidence. The two leaves must not be normalized copies or transliterations. Do not add IDs or numbers outside the preserved evidence. Return only chair_section_rewrite JSON.`
      : `${sectionPublicSummaryConstruction(input.sectionKey, input.prompt.mandate.researchProfile.analysisDepth)} ${explanationInstruction(input.prompt.mandate.researchProfile)} Synthesize the evidence instead of copying the primary sentence verbatim. Return only chair_section_rewrite JSON. Do not add IDs or numbers outside the permitted catalog.`,
  });
}

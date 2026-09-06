import type { z } from "zod";
import type {
  AtomicEditorialClaimSchema,
  ChairSynthesisOutputSchema,
} from "../domain/agentOutputs";
import { ArtifactIdSchema, ClaimIdSchema } from "../domain/ids";
import type { AssemblyInput } from "./assembleReportContracts";

type Chair = z.infer<typeof ChairSynthesisOutputSchema>;
type Claim = z.infer<typeof AtomicEditorialClaimSchema>;
type Sentence = AssemblyInput["chairSentences"][number];
type Canonical = NonNullable<Chair["canonicalNarrativeV3"]>;
type Unit = {
  text: Sentence["text"];
  lineage: Canonical["decisionLineage"]["decisiveReason"];
  sentence: Sentence;
};

const LIMITATIONS = {
  ten_second_brief: {
    en: "The evidence supports a narrower conclusion; the original investment thesis remains unconfirmed.",
    ko: "확인된 근거로 판단 범위를 좁혔으며, 기존 투자 논리 전체는 아직 확인되지 않았습니다.",
  },
  supported_analysis: {
    en: "Only the findings that passed the evidence review are retained as established facts.",
    ko: "근거 검토를 통과한 항목만 확인된 사실로 반영했습니다.",
  },
  valuation_comparison: {
    en: "The available evidence does not establish the assumptions needed for a reliable valuation comparison.",
    ko: "현재 근거로는 신뢰할 만한 밸류에이션 비교에 필요한 가정을 확인하기 어렵습니다.",
  },
  operational_scenarios: {
    en: "The proposed operating scenarios depend on assumptions that remain unverified.",
    ko: "제시된 운영 시나리오는 아직 확인되지 않은 가정에 의존합니다.",
  },
  dissent_unknowns: {
    en: "Some supporting evidence was only partially verified. It cannot establish the original conclusion on its own.",
    ko: "일부 근거는 부분적으로만 확인됐습니다. 이 근거만으로 기존 결론을 확정할 수 없습니다.",
  },
  change_conditions: {
    en: "Reassess the conclusion when subsequent company disclosures resolve the unverified assumptions.",
    ko: "후속 기업 공시에서 확인되지 않은 가정이 해소되면 결론을 다시 평가합니다.",
  },
} as const;

/** Rebuild public prose after eligibility filtering; never re-label an old conclusion
 * with different claim IDs or change an authenticated audit verdict. */
export function reconcilePublicationNarrative(input: {
  readonly chair: Chair;
  readonly sentences: AssemblyInput["chairSentences"];
  readonly claims: readonly Claim[];
  readonly registeredClaimIds: ReadonlySet<string>;
  readonly auditArtifactId: string;
  readonly auditReasons?: readonly {
    readonly claimId: string;
    readonly reason: string;
  }[];
}) {
  const { chair } = input;
  const canonical = chair.canonicalNarrativeV3;
  const ids = new Set<string>(input.claims.map((claim) => claim.claimId));
  const missingPrimary = chair.decisionBrief.primaryClaimIds.some(
    (id) => !ids.has(id),
  );
  const unknownPrimary = chair.decisionBrief.primaryClaimIds.some(
    (id) => !input.registeredClaimIds.has(id),
  );
  const unaffected = {
    chair,
    sentences: input.sentences,
    rebuilt: false,
    reduced: false,
  };
  // Invented identities and a complete absence of grounded evidence remain blocking.
  if (!canonical || unknownPrimary || input.claims.length === 0)
    return unaffected;
  const catalog = new Map(
    input.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const extra: Sentence[] = [];
  let reduced = false;
  const unit = (
    key: string,
    text: Sentence["text"],
    claims: readonly string[],
    sources: readonly string[],
  ): Unit => {
    const sentence: Sentence = {
      sentenceId: `publication:${key}`,
      kind: "unknown",
      text,
      claimIds: claims,
      sourceArtifactIds: sources,
    };
    extra.push(sentence);
    return {
      text,
      sentence,
      lineage: {
        sentenceIds: [sentence.sentenceId],
        claimIds: claims.map((id) => ClaimIdSchema.parse(id)),
        sourceArtifactIds: sources.map((id) => ArtifactIdSchema.parse(id)),
      },
    };
  };
  const limited = (
    key: keyof typeof LIMITATIONS,
    suffix = "",
    claimIds: readonly string[] = [],
  ) => {
    const reasons = [
      ...new Set(
        (input.auditReasons ?? [])
          .filter((item) => claimIds.includes(item.claimId))
          .map((item) => item.reason),
      ),
    ]
      .slice(0, 2)
      .join(" ");
    const text =
      reasons &&
      reasons.length +
        Math.max(LIMITATIONS[key].en.length, LIMITATIONS[key].ko.length) <
        3_900
        ? {
            en: `${LIMITATIONS[key].en} Evidence review: ${reasons}`,
            ko: `${LIMITATIONS[key].ko} 근거 검토: ${reasons}`,
          }
        : LIMITATIONS[key];
    return unit(`${key}${suffix}`, text, [], [input.auditArtifactId]);
  };
  const survives = (lineage: Canonical["decisionLineage"]["decisiveReason"]) =>
    lineage.claimIds.every((id) => ids.has(id)) &&
    lineage.sentenceIds.every((id) => {
      const sentence = catalog.get(id);
      return (
        sentence !== undefined &&
        sentence.claimIds.every((claimId) => ids.has(claimId))
      );
    });
  const retained = (
    text: string,
    lineage: Canonical["decisionLineage"]["decisiveReason"],
    key: keyof typeof LIMITATIONS,
    suffix = "",
  ) => {
    if (survives(lineage)) return { text: { en: text, ko: text }, lineage };
    reduced = true;
    return limited(key, suffix, lineage.claimIds);
  };
  // Prefer a surviving original primary, then a material verified claim.
  // Replacing the primary always rebuilds the thesis and lowers confidence.
  const originalPrimary = input.sentences.find(
    (s) => s.sentenceId === chair.decisionBrief.decisiveSentenceId,
  );
  const lead =
    input.claims.find((c) =>
      chair.decisionBrief.primaryClaimIds.includes(c.claimId),
    ) ??
    input.claims.find((c) => originalPrimary?.claimIds.includes(c.claimId)) ??
    input.claims.find((c) => c.materiality === "material") ??
    input.claims[0]!;
  const decisive = missingPrimary
    ? unit(
        "decision",
        {
          en:
            lead.publicThesis.en.length < 3_800
              ? `${LIMITATIONS.ten_second_brief.en} ${lead.publicThesis.en}`
              : lead.publicThesis.en,
          ko:
            lead.publicThesis.ko.length < 3_800
              ? `${LIMITATIONS.ten_second_brief.ko} ${lead.publicThesis.ko}`
              : lead.publicThesis.ko,
        },
        [lead.claimId],
        lead.evidenceArtifactIds,
      )
    : retained(
        canonical.decisiveReason,
        canonical.decisionLineage.decisiveReason,
        "ten_second_brief",
      );
  const countercase = missingPrimary
    ? limited(
        "dissent_unknowns",
        ":decision",
        chair.decisionBrief.primaryClaimIds,
      )
    : retained(
        canonical.strongestCountercase,
        canonical.decisionLineage.strongestCountercase,
        "dissent_unknowns",
      );
  const falsifier = missingPrimary
    ? unit(
        "decision:checkpoint",
        lead.falsifier,
        [lead.claimId],
        lead.evidenceArtifactIds,
      )
    : retained(
        canonical.invalidationCheckpoint,
        canonical.decisionLineage.invalidationCheckpoint,
        "change_conditions",
      );
  const supportedClaims: Claim[] = [];
  for (const claim of [
    lead,
    ...input.claims.filter((item) => item.claimId !== lead.claimId),
  ]) {
    const next = [...supportedClaims, claim];
    if (
      next.length > 3 ||
      ["en", "ko"].some(
        (locale) =>
          next.map((item) => item.publicThesis[locale as "en" | "ko"]).join(" ")
            .length > 4_000,
      ) ||
      new Set(next.flatMap((item) => item.evidenceArtifactIds)).size > 64
    )
      continue;
    supportedClaims.push(claim);
  }
  const supported = missingPrimary
    ? unit(
        "supported_analysis:retained",
        {
          en: supportedClaims.map((claim) => claim.publicThesis.en).join(" "),
          ko: supportedClaims.map((claim) => claim.publicThesis.ko).join(" "),
        },
        supportedClaims.map((claim) => claim.claimId),
        [
          ...new Set(
            supportedClaims.flatMap((claim) => claim.evidenceArtifactIds),
          ),
        ],
      )
    : undefined;
  const sections = canonical.sections.map((section) => {
    const next =
      missingPrimary && section.sectionKey === "ten_second_brief"
        ? decisive
        : supported && section.sectionKey === "supported_analysis"
          ? supported
          : missingPrimary && section.sectionKey === "change_conditions"
            ? falsifier
            : retained(section.narrative, section.lineage, section.sectionKey);
    return {
      ...section,
      narrative: next.text[canonical.sourceLocale],
      lineage: next.lineage,
    };
  });
  const teamViews = canonical.teamViews.map((view) => {
    if (survives(view.lineage)) return view;
    reduced = true;
    const next = limited(
      "supported_analysis",
      `:${view.departmentId}`,
      view.lineage.claimIds,
    );
    return {
      ...view,
      position: next.text[canonical.sourceLocale],
      rationale: LIMITATIONS.dissent_unknowns[canonical.sourceLocale],
      vote: "abstain" as const,
      lineage: next.lineage,
    };
  });
  const anticipatedQuestions = canonical.anticipatedQuestions.filter(
    (question) => {
      if (survives(question.lineage)) return true;
      reduced = true;
      return false;
    },
  );
  if (!missingPrimary && !reduced) return unaffected;
  const publicationCanonical: Canonical = {
    ...canonical,
    stance: missingPrimary ? "insufficient_evidence" : canonical.stance,
    decisiveReason: decisive.text[canonical.sourceLocale],
    strongestCountercase: countercase.text[canonical.sourceLocale],
    invalidationCheckpoint: falsifier.text[canonical.sourceLocale],
    decisionLineage: {
      decisiveReason: decisive.lineage,
      strongestCountercase: countercase.lineage,
      invalidationCheckpoint: falsifier.lineage,
    },
    sections,
    teamViews,
    anticipatedQuestions,
    publicationReductionReasons: [
      ...new Set([
        ...(canonical.publicationReductionReasons ?? []),
        "grounding_rewrite" as const,
      ]),
    ],
  };
  const publicationChair: Chair = {
    ...chair,
    sourceArtifactIds: [
      ...new Set([
        ...chair.sourceArtifactIds,
        ArtifactIdSchema.parse(input.auditArtifactId),
      ]),
    ],
    decisionBrief: {
      ...chair.decisionBrief,
      ...(missingPrimary
        ? {
            stance: "insufficient_evidence" as const,
            confidence: "low" as const,
            primaryClaimIds: [lead.claimId],
            primarySentenceIds: decisive.lineage.sentenceIds,
            decisiveSentenceId: decisive.lineage.sentenceIds[0]!,
            countercaseSentenceId: countercase.lineage.sentenceIds[0]!,
            falsifierSentenceId: falsifier.lineage.sentenceIds[0]!,
          }
        : {}),
      decisiveReason: decisive.text,
      strongestCountercase: countercase.text,
      falsifier: falsifier.text,
    },
    sections: chair.sections.map((section) => {
      const next = sections.find((s) => s.sectionKey === section.sectionKey)!;
      return {
        ...section,
        publicSummary: { en: next.narrative, ko: next.narrative },
        auditedClaimIds: next.lineage.claimIds,
        sourceArtifactIds: next.lineage.sourceArtifactIds,
        primarySentenceId: next.lineage.sentenceIds[0]!,
        sentenceIds: next.lineage.sentenceIds,
      };
    }),
    canonicalNarrativeV3: publicationCanonical,
  };
  return {
    chair: publicationChair,
    sentences: [...input.sentences, ...extra],
    rebuilt: missingPrimary,
    reduced: true,
  };
}

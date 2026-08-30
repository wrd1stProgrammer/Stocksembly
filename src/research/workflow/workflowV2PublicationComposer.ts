import type { z } from "zod";
import type {
  AtomicEditorialClaimSchema,
  ChairSynthesisOutputSchema,
} from "../domain/agentOutputs";
import {
  extractNumericTokens,
  normalizeEditorialText,
  sanitizePublicEditorialText,
} from "../domain/editorialQuality";
import {
  type ResearchReport,
  type WorkflowV2ResearchReport,
  WorkflowV2ResearchReportSchema,
} from "../domain/report";
import type { ResearchProfile } from "../domain/researchProfile";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import {
  ANTICIPATED_QUESTIONS_POLICY,
  selectGroundedAnticipatedQuestions,
} from "./anticipatedQuestionsPublication";
import type {
  PrePublicationEditorialCandidate,
  PrePublicationEditorialEnvelope,
} from "./prePublicationEditorialGate";

type Chair = z.infer<typeof ChairSynthesisOutputSchema>;

function isThinSectionText(text: string): boolean {
  const normalized = normalizeEditorialText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  return (
    tokens.length <= 2 &&
    (extractNumericTokens(text).length > 0 ||
      /^[\p{L}\p{N}_-]+$/u.test(normalized))
  );
}

function sectionFallbackText(
  claim: z.infer<typeof AtomicEditorialClaimSchema> | undefined,
  sentence:
    | Readonly<{ text?: Readonly<{ en: string; ko: string }> }>
    | undefined,
  locale: "en" | "ko",
  original: string,
): string {
  const base =
    claim === undefined ? sentence?.text?.[locale] : claim.publicThesis[locale];
  return base?.trim() || original.trim();
}

export function composeWorkflowV2Report(
  input: Readonly<{
    legacyReport: ResearchReport;
    chair: Chair;
    chairSentences: readonly Readonly<{
      sentenceId: string;
      claimIds: readonly string[];
      text?: Readonly<{ en: string; ko: string }>;
    }>[];
    comparators: WorkflowV2ResearchReport["comparators"];
    editorialClaims: readonly z.infer<typeof AtomicEditorialClaimSchema>[];
    researchProfile?: ResearchProfile;
  }>,
): Readonly<{
  report: WorkflowV2ResearchReport;
  envelope: PrePublicationEditorialEnvelope;
}> {
  const registered = new Set(
    input.legacyReport.claims.map((claim) => claim.claimId),
  );
  const registeredOwners = new Set<string>(WORKFLOW_V1_SPECIALIST_IDS);
  const editorialClaims = input.editorialClaims
    .filter((claim) => registered.has(claim.claimId))
    .map((claim) => ({
      ...claim,
      publicThesis: {
        en: sanitizePublicEditorialText(claim.publicThesis.en),
        ko: sanitizePublicEditorialText(claim.publicThesis.ko),
      },
      falsifier: {
        en: sanitizePublicEditorialText(claim.falsifier.en),
        ko: sanitizePublicEditorialText(claim.falsifier.ko),
      },
    }));
  if (
    editorialClaims.length === 0 ||
    editorialClaims.some((claim) => !registeredOwners.has(claim.roleOwner))
  )
    throw new TypeError("authenticated_editorial_claim_ownership_required");
  const editorialClaimIds = new Set<string>(
    editorialClaims.map((claim) => claim.claimId),
  );
  const retainedPrimaryClaimIds =
    input.chair.decisionBrief.primaryClaimIds.filter((claimId) =>
      editorialClaimIds.has(claimId),
    );
  const fallbackPrimaryClaimId = editorialClaims[0]?.claimId;
  if (fallbackPrimaryClaimId === undefined)
    throw new TypeError("authenticated_editorial_claim_required");
  const decision = {
    stance: input.chair.decisionBrief.stance,
    confidence: input.chair.decisionBrief.confidence,
    decisiveReason: input.chair.decisionBrief.decisiveReason,
    strongestCountercase: input.chair.decisionBrief.strongestCountercase,
    falsifier: input.chair.decisionBrief.falsifier,
    primaryClaimIds:
      retainedPrimaryClaimIds.length > 0
        ? retainedPrimaryClaimIds
        : [fallbackPrimaryClaimId],
  } as const;
  const qa = selectGroundedAnticipatedQuestions({
    runId: input.legacyReport.runId,
    decision,
    claims: editorialClaims,
    ...(input.researchProfile === undefined
      ? {}
      : { researchProfile: input.researchProfile }),
    ...(input.legacyReport.metricSnapshot === undefined
      ? {}
      : { metricSnapshot: input.legacyReport.metricSnapshot }),
    ...(input.legacyReport.marketSnapshot === undefined
      ? {}
      : { marketSnapshot: input.legacyReport.marketSnapshot }),
  });
  const report = WorkflowV2ResearchReportSchema.parse({
    ...input.legacyReport,
    schemaVersion: "workflow-v2",
    editorialClaims,
    editorialDecision: decision,
    comparators: input.comparators,
    anticipatedQuestions: qa.questions,
  });
  const sentenceClaims = new Map(
    input.chairSentences.map((sentence) => [
      sentence.sentenceId,
      sentence.claimIds,
    ]),
  );
  const leadTeam = report.teamViews[0]!;
  const checkpointKeys = new Set<string>();
  const candidate: PrePublicationEditorialCandidate = {
    position: leadTeam.position,
    rationale: leadTeam.rationale,
    sections: input.chair.sections.flatMap((section) => {
      const claimIds = (
        sentenceClaims.get(section.primarySentenceId) ?? []
      ).filter((claimId) => editorialClaimIds.has(claimId));
      const primaryClaim = report.editorialClaims.find((claim) =>
        claimIds.includes(claim.claimId),
      );
      const sourceSentence = input.chairSentences.find(
        (sentence) => sentence.sentenceId === section.primarySentenceId,
      );
      const text = (["en", "ko"] as const).reduce(
        (localized, locale) => {
          const raw = section.publicSummary[locale];
          const next = isThinSectionText(raw)
            ? sectionFallbackText(primaryClaim, sourceSentence, locale, raw)
            : raw;
          return { ...localized, [locale]: next };
        },
        {} as { en: string; ko: string },
      );
      const checkpointKey =
        primaryClaim === undefined
          ? undefined
          : `${primaryClaim.falsifier.en}\u0000${primaryClaim.falsifier.ko}`;
      const ownsCheckpoint =
        checkpointKey !== undefined && !checkpointKeys.has(checkpointKey);
      if (checkpointKey !== undefined) checkpointKeys.add(checkpointKey);
      return [
        {
          sectionKey: section.sectionKey,
          text,
          claimIds,
          ...(!ownsCheckpoint || primaryClaim === undefined
            ? {}
            : { checkpoint: primaryClaim.falsifier }),
        },
      ];
    }),
    comparators: report.comparators,
    anticipatedQuestions: report.anticipatedQuestions,
    supportedNumbers: [
      ...new Set(
        report.editorialClaims
          .flatMap((claim) => [
            ...extractNumericTokens(claim.publicThesis.en),
            ...extractNumericTokens(claim.publicThesis.ko),
            ...extractNumericTokens(claim.falsifier.en),
            ...extractNumericTokens(claim.falsifier.ko),
          ])
          .concat(
            input.chairSentences.flatMap((sentence) =>
              sentence.text === undefined
                ? []
                : [
                    ...extractNumericTokens(sentence.text.en),
                    ...extractNumericTokens(sentence.text.ko),
                  ],
            ),
          )
          .concat(qa.supportedNumbers),
      ),
    ],
    permittedClaimIds: report.editorialClaims.map((claim) => claim.claimId),
    permittedEvidenceArtifactIds: [
      ...new Set(
        report.editorialClaims.flatMap((claim) => claim.evidenceArtifactIds),
      ),
    ],
    confidence: report.editorialDecision.confidence,
  };
  return {
    report,
    envelope: {
      gateVersion: "editorial-quality-v1",
      qaPolicy: {
        ...ANTICIPATED_QUESTIONS_POLICY,
        supportedCount: qa.supportedCount,
        moduleVisible: qa.moduleVisible,
      },
      candidate,
    },
  };
}

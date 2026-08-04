import { z } from "zod";
import {
  AtomicEditorialClaimSchema,
  BilingualPublicTextSchema,
  ClaimIdsSchema,
  ComparatorSchema,
  DissentListSchema,
  PersistedQuestionAnswerSchema,
  PublicPositionSchema,
  SourceArtifactIdsSchema,
  TeamEditorialDecisionSchema,
  UnknownListSchema,
} from "./agentOutputsShared";
import { ChairSynthesisOutputSchema } from "./chairSynthesisOutput";

export {
  AtomicEditorialClaimSchema,
  ComparatorSchema,
  EditorialConfidenceSchema,
  EditorialDecisionDimensionSchema,
  EditorialStanceSchema,
  PersistedQuestionAnswerSchema,
  TeamEditorialDecisionSchema,
} from "./agentOutputsShared";

export const WorkflowV2EditorialOutputSchema = z
  .object({
    schemaVersion: z.literal("workflow-v2"),
    claims: z.array(AtomicEditorialClaimSchema).min(1).max(64).readonly(),
    decision: TeamEditorialDecisionSchema,
    comparators: z.array(ComparatorSchema).max(64).readonly(),
    anticipatedQuestions: z
      .array(PersistedQuestionAnswerSchema)
      .max(32)
      .readonly(),
  })
  .strict()
  .superRefine((output, context) => {
    const claimIds = output.claims.map((claim) => claim.claimId);
    if (new Set(claimIds).size !== claimIds.length)
      context.addIssue({
        code: "custom",
        path: ["claims"],
        message: "duplicate claim ownership",
      });
    const knownClaimIds = new Set(claimIds);
    for (const claimId of output.decision.primaryClaimIds)
      if (!knownClaimIds.has(claimId))
        context.addIssue({
          code: "custom",
          path: ["decision", "primaryClaimIds"],
          message: "decision cites unknown claim",
        });
    for (const qa of output.anticipatedQuestions)
      for (const claimId of qa.primaryClaimIds)
        if (!knownClaimIds.has(claimId))
          context.addIssue({
            code: "custom",
            path: ["anticipatedQuestions"],
            message: "Q&A cites unknown claim",
          });
  })
  .readonly();

import { ClaimIdSchema, QuestionIdSchema } from "./ids";

export {
  ChairConflictAdjudicationSchema,
  ChairDecisionBriefSchema,
  ChairSynthesisOutputSchema,
} from "./chairSynthesisOutput";

export const MemoOutputSchema = z
  .object({
    kind: z.literal("memo"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    positions: z.array(PublicPositionSchema).min(1).max(32).readonly(),
    dissent: DissentListSchema,
    unknowns: UnknownListSchema,
  })
  .strict()
  .readonly();

export const DepartmentClaimDispositionSchema = z
  .object({
    claimId: ClaimIdSchema,
    disposition: z.enum(["accept", "revise", "remove"]),
    reason: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const DepartmentClaimRevisionSchema = z
  .object({
    originClaimId: ClaimIdSchema,
    adjudicatedClaimId: ClaimIdSchema,
    publicSummary: BilingualPublicTextSchema,
    falsifier: BilingualPublicTextSchema,
    revisionHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: BilingualPublicTextSchema,
    sourceArtifactIds: SourceArtifactIdsSchema,
  })
  .strict()
  .readonly();

export const DepartmentConsolidationOutputSchema = z
  .object({
    kind: z.literal("department_consolidation"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    agreementClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    disagreementClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    acceptedClaimIds: ClaimIdsSchema,
    strongestClaimIds: ClaimIdsSchema,
    weakestClaimIds: ClaimIdsSchema,
    revisedClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    removedClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    dispositions: z
      .array(DepartmentClaimDispositionSchema)
      .min(1)
      .max(64)
      .readonly(),
    revisions: z.array(DepartmentClaimRevisionSchema).max(64).readonly(),
    publicSummary: BilingualPublicTextSchema,
    dissent: DissentListSchema,
    openQuestions: UnknownListSchema,
    evidencePriorityArtifactIds: SourceArtifactIdsSchema,
  })
  .strict()
  .readonly();

export const BlindChallengeOutputSchema = z
  .object({
    kind: z.literal("blind_challenge"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    challengedClaimIds: z.array(ClaimIdSchema).length(1).readonly(),
    publicChallenge: BilingualPublicTextSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
    contradiction: z.enum(["direct", "partial", "not_established"]),
    materiality: z.enum(["material", "supporting"]),
    followupRequest: z
      .object({
        targetClaimId: ClaimIdSchema,
        kind: z.enum([
          "source_scope_clarification",
          "calculation_recheck",
          "change_condition_check",
        ]),
        evidenceArtifactIds: SourceArtifactIdsSchema,
      })
      .strict()
      .readonly()
      .nullable(),
  })
  .strict()
  .readonly();

const ClaimDispositionSchema = z
  .object({
    claimId: ClaimIdSchema,
    disposition: z.enum(["accept", "revise", "reject"]),
    publicRationale: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

const DepartmentBallotSchema = z
  .object({
    vote: z.enum(["support", "support_with_reservations", "oppose", "abstain"]),
    rationaleClaimIds: ClaimIdsSchema,
    publicRationale: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const OwnerResponseBallotOutputSchema = z
  .object({
    kind: z.literal("owner_response_ballot"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    dispositions: z.array(ClaimDispositionSchema).min(1).max(64).readonly(),
    ballot: DepartmentBallotSchema,
    dissent: DissentListSchema,
    unresolvedConditions: UnknownListSchema,
  })
  .strict()
  .readonly();

export const FollowUpOutputSchema = z
  .object({
    kind: z.literal("follow_up"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    requestId: QuestionIdSchema,
    publicAnswer: BilingualPublicTextSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
    unresolved: UnknownListSchema,
  })
  .strict()
  .readonly();

const SemanticVerdictSchema = z
  .object({
    claimId: ClaimIdSchema,
    verdict: z.enum(["entailed", "partial", "contradicted", "not_assessable"]),
    contradictionSeverity: z.enum(["none", "limited", "severe"]),
    evidenceArtifactIds: SourceArtifactIdsSchema,
    publicExplanation: BilingualPublicTextSchema,
  })
  .strict()
  .superRefine((verdict, context) => {
    if (
      (verdict.verdict === "entailed" ||
        verdict.verdict === "not_assessable") &&
      verdict.contradictionSeverity !== "none"
    )
      context.addIssue({
        code: "custom",
        message: "non-contradiction verdict requires none severity",
        path: ["contradictionSeverity"],
      });
    if (
      verdict.verdict === "contradicted" &&
      verdict.contradictionSeverity === "none"
    )
      context.addIssue({
        code: "custom",
        message: "contradicted verdict requires contradiction severity",
        path: ["contradictionSeverity"],
      });
  })
  .readonly();

const QuestionCoverageSchema = z
  .object({
    questionId: QuestionIdSchema,
    status: z.enum(["covered", "partial", "uncovered"]),
    claimIds: z.array(ClaimIdSchema).max(64).readonly(),
  })
  .strict()
  .readonly();

export const SemanticAuditOutputSchema = z
  .object({
    kind: z.literal("semantic_audit"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    verdicts: z.array(SemanticVerdictSchema).min(1).max(128).readonly(),
    questionCoverage: z.array(QuestionCoverageSchema).max(32).readonly(),
  })
  .strict()
  .readonly();

export const AgentOutputCandidateSchema = z.discriminatedUnion("kind", [
  MemoOutputSchema,
  DepartmentConsolidationOutputSchema,
  BlindChallengeOutputSchema,
  OwnerResponseBallotOutputSchema,
  FollowUpOutputSchema,
  SemanticAuditOutputSchema,
  ChairSynthesisOutputSchema,
]);
export type AgentOutputCandidate = z.infer<typeof AgentOutputCandidateSchema>;

import { z } from "zod";
import {
  BilingualPublicTextSchema,
  ClaimIdsSchema,
  DissentListSchema,
  PublicPositionSchema,
  SourceArtifactIdsSchema,
  UnknownListSchema,
} from "./agentOutputsShared";
import { ArtifactIdSchema, ClaimIdSchema, QuestionIdSchema } from "./ids";

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

const ChairSectionSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(80),
    sectionKey: z.enum([
      "ten_second_brief",
      "supported_analysis",
      "operational_scenarios",
      "dissent_unknowns",
      "change_conditions",
    ]),
    publicSummary: BilingualPublicTextSchema,
    sentenceIds: z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(64)
      .readonly(),
    sourceArtifactIds: SourceArtifactIdsSchema,
    auditedClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
  })
  .strict()
  .readonly();

export const ChairSynthesisOutputSchema = z
  .object({
    kind: z.literal("chair_synthesis"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    sections: z.array(ChairSectionSchema).min(1).max(12).readonly(),
    ballotArtifactIds: z
      .array(ArtifactIdSchema)
      .length(4)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate ballot artifact",
      )
      .readonly(),
    dissentClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    unknowns: UnknownListSchema,
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

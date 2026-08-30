import { z } from "zod";
import {
  BilingualPublicTextSchema,
  SourceArtifactIdsSchema,
  TeamEditorialDecisionSchema,
  UnknownListSchema,
} from "./agentOutputsShared";
import { ArtifactIdSchema, ClaimIdSchema, QuestionIdSchema } from "./ids";

const CanonicalNarrativeSchema = z.string().trim().min(1).max(4_000);

export const ChairSynthesisV3LineageSchema = z
  .object({
    sentenceIds: z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(16)
      .readonly(),
    claimIds: z.array(ClaimIdSchema).max(64).readonly(),
    sourceArtifactIds: SourceArtifactIdsSchema,
  })
  .strict()
  .readonly();

export const ChairSynthesisV3CanonicalNarrativeSchema = z
  .object({
    kind: z.literal("chair_synthesis_v3"),
    sourceLocale: z.enum(["en", "ko"]),
    stance: z.enum([
      "upside_skewed",
      "downside_skewed",
      "balanced",
      "insufficient_evidence",
    ]),
    decisiveReason: CanonicalNarrativeSchema,
    strongestCountercase: CanonicalNarrativeSchema,
    invalidationCheckpoint: CanonicalNarrativeSchema,
    decisionLineage: z
      .object({
        decisiveReason: ChairSynthesisV3LineageSchema,
        strongestCountercase: ChairSynthesisV3LineageSchema,
        invalidationCheckpoint: ChairSynthesisV3LineageSchema,
      })
      .strict()
      .readonly(),
    teamViews: z
      .array(
        z
          .object({
            departmentId: z.enum(["market", "company", "financial", "risk"]),
            position: CanonicalNarrativeSchema,
            rationale: CanonicalNarrativeSchema,
            vote: z.enum([
              "support",
              "support_with_reservations",
              "oppose",
              "abstain",
            ]),
            lineage: ChairSynthesisV3LineageSchema,
          })
          .strict(),
      )
      .length(4)
      .refine(
        (views) => new Set(views.map((view) => view.departmentId)).size === 4,
        "canonical v3 team views must be unique",
      ),
    sections: z
      .array(
        z
          .object({
            sectionKey: z.enum([
              "ten_second_brief",
              "supported_analysis",
              "valuation_comparison",
              "operational_scenarios",
              "dissent_unknowns",
              "change_conditions",
            ]),
            narrative: CanonicalNarrativeSchema,
            lineage: ChairSynthesisV3LineageSchema,
          })
          .strict(),
      )
      .length(6)
      .refine(
        (sections) =>
          new Set(sections.map((section) => section.sectionKey)).size === 6,
        "canonical v3 sections must be unique",
      ),
    anticipatedQuestions: z
      .array(
        z
          .object({
            question: CanonicalNarrativeSchema.max(500),
            answer: CanonicalNarrativeSchema.max(1_200),
            lineage: ChairSynthesisV3LineageSchema,
          })
          .strict(),
      )
      .max(32),
    publicationReductionReasons: z
      .array(
        z.enum([
          "direct_order_rewrite",
          "repeated_posture_rewrite",
          "anticipated_question_omission",
          "grounding_rewrite",
          "stance_reconciliation",
          "deterministic_fallback",
          "projection_fallback",
        ]),
      )
      .max(7)
      .optional(),
  })
  .strict()
  .readonly();

export const ChairRecoveryMetadataSchema = z
  .object({
    comparatorNormalizationAttemptCount: z.number().int().nonnegative(),
    scenarioRepairAttempts: z
      .array(
        z
          .object({ itemId: z.string().min(1), attempts: z.literal(1) })
          .strict(),
      )
      .readonly(),
    omissions: z
      .array(
        z
          .object({
            itemId: z.string().min(1),
            reason: z.enum([
              "peer_evidence_absent",
              "peer_evidence_malformed",
              "valuation_metric_unavailable",
              "insufficient_eligible_companies",
              "scenario_invalid_after_repair",
              "scenario_limit_exceeded",
            ]),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const ChairConflictAdjudicationSchema = z
  .object({
    departmentDecisionSentenceIds: z
      .array(z.string().trim().min(1).max(160))
      .min(2)
      .max(8)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate department decision",
      )
      .readonly(),
    resolution: z.enum([
      "upside_dominates",
      "proof_required",
      "downside_dominates",
    ]),
    reasonSentenceId: z.string().trim().min(1).max(160),
  })
  .strict()
  .readonly();

const ChairSectionSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(80),
    sectionKey: z.enum([
      "ten_second_brief",
      "supported_analysis",
      "valuation_comparison",
      "operational_scenarios",
      "dissent_unknowns",
      "change_conditions",
    ]),
    publicSummary: BilingualPublicTextSchema,
    primarySentenceId: z.string().trim().min(1).max(160),
    sentenceIds: z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(64)
      .readonly(),
    sourceArtifactIds: SourceArtifactIdsSchema,
    auditedClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    conflictAdjudication: ChairConflictAdjudicationSchema.optional(),
  })
  .strict()
  .readonly();

export const ChairDecisionBriefSchema = TeamEditorialDecisionSchema.unwrap()
  .extend({
    decisiveSentenceId: z.string().trim().min(1).max(160),
    countercaseSentenceId: z.string().trim().min(1).max(160),
    falsifierSentenceId: z.string().trim().min(1).max(160),
    primarySentenceIds: z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(8)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate primary sentence",
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const ChairSynthesisOutputSchema = z
  .object({
    kind: z.literal("chair_synthesis"),
    sourceArtifactIds: SourceArtifactIdsSchema,
    decisionBrief: ChairDecisionBriefSchema,
    sections: z.array(ChairSectionSchema).length(6).readonly(),
    ballotArtifactIds: z
      .array(ArtifactIdSchema)
      .length(4)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate ballot artifact",
      )
      .readonly(),
    dissentClaimIds: z.array(ClaimIdSchema).max(64).readonly(),
    selectedUnknownIds: z.array(QuestionIdSchema).max(2).readonly(),
    unknowns: UnknownListSchema,
    canonicalNarrativeV3: ChairSynthesisV3CanonicalNarrativeSchema.optional(),
    recoveryMetadata: ChairRecoveryMetadataSchema.optional(),
  })
  .strict()
  .superRefine((output, context) => {
    const sectionKeys = output.sections.map((section) => section.sectionKey);
    if (new Set(sectionKeys).size !== sectionKeys.length)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "duplicate section ownership",
      });
    const sentenceIds = output.sections.map(
      (section) => section.primarySentenceId,
    );
    if (new Set(sentenceIds).size !== sentenceIds.length)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "duplicate sentence ownership",
      });
    for (const section of output.sections)
      if (!section.sentenceIds.includes(section.primarySentenceId))
        context.addIssue({
          code: "custom",
          path: ["sections"],
          message: "primary sentence is not owned",
        });
    for (const section of output.sections)
      if (
        (section.sectionKey === "supported_analysis") !==
        (section.conflictAdjudication !== undefined)
      )
        context.addIssue({
          code: "custom",
          path: ["sections"],
          message: "supported analysis adjudication mismatch",
        });
    const brief = output.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    if (
      brief === undefined ||
      output.decisionBrief.primarySentenceIds.some(
        (sentenceId) => !brief.sentenceIds.includes(sentenceId),
      ) ||
      output.decisionBrief.primaryClaimIds.some(
        (claimId) => !brief.auditedClaimIds.includes(claimId),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["decisionBrief"],
        message: "decision brief ownership mismatch",
      });
  })
  .readonly();

import { z } from "zod";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { HashSchema } from "../domain/evidenceSchemas";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";

const AUDITED_WEB_INSTRUCTIONS =
  "All permitted information, including the target claim and debate context, is in this request. Use at most two focused native hosted searches to resolve the decision-changing gap; open the issuer primary source and verify the period, entity and claim direction. Distinguish new evidence from original inputs and name what remains unresolved; do not call any other tool or read files. Return only JSON matching the output schema. Answer the supplied claim directly; never say the claim text or delegated question is missing.";

export const BallotVoteSchema = z.enum([
  "support",
  "support_with_reservations",
  "oppose",
  "abstain",
]);
export type BallotVote = z.infer<typeof BallotVoteSchema>;
export const CommitteeConsensusSchema = BallotVoteSchema;

export const FollowupJobPromptSchema = z
  .object({
    kind: z.literal("bounded_followup_input_v1"),
    requestId: QuestionIdSchema,
    actorId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
    targetClaimId: ClaimIdSchema,
    targetContext: BilingualPublicTextSchema.optional(),
    targetClaim: BilingualPublicTextSchema.optional(),
    falsifier: BilingualPublicTextSchema.optional(),
    requestKind: z.enum([
      "source_scope_clarification",
      "calculation_recheck",
      "change_condition_check",
    ]),
    sourceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
    evidenceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
    instructions: z
      .literal(AUDITED_WEB_INSTRUCTIONS)
      .default(AUDITED_WEB_INSTRUCTIONS),
  })
  .strict()
  .readonly();

export const OwnerResponseJobPromptSchema = z
  .object({
    kind: z.literal("owner_response_input_v1"),
    departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
    sourceArtifactIds: z.array(ArtifactIdSchema).min(2).max(64).readonly(),
    targetClaimIds: z.array(ClaimIdSchema).min(1).max(64).readonly(),
    challengeContext: BilingualPublicTextSchema.optional(),
    followupResult: z
      .object({
        publicAnswer: BilingualPublicTextSchema,
        unresolved: z.array(BilingualPublicTextSchema).max(32),
      })
      .optional(),
    departmentContext: z
      .array(BilingualPublicTextSchema)
      .max(32)
      .default([])
      .readonly(),
    publicUnknowns: z.array(BilingualPublicTextSchema).max(32).readonly(),
    instructions: z
      .string()
      .default(
        "Use only the supplied claim, departmentContext and followupResult. Do not use tools. Explain whether the follow-up changes the claim; if it remains unresolved, do not treat missing evidence as support. Check that falsification conditions weaken rather than reinforce the thesis. Return only schema JSON.",
      ),
  })
  .strict()
  .readonly();

export const PersistedFollowupResponseJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    jobId: JobIdSchema,
    logicalArtifactId: z.string().regex(/^(followup|response_ballot):[a-z_]+$/),
    stage: z.enum(["follow_up", "owner_response_ballot"]),
    prompt: z.string().min(1),
    inputHash: HashSchema,
    inputManifestHash: HashSchema,
    citableArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedFollowupResponseJob = z.infer<
  typeof PersistedFollowupResponseJobSchema
>;

export type PublicUnknown = z.infer<typeof BilingualPublicTextSchema>;
export type FollowupResponseReceipt = {
  readonly ordinal: number;
  readonly logicalArtifactId: string;
  readonly attemptId: string;
  readonly outcome: string;
  readonly evidenceRecorded: boolean;
};
export type FollowupAndResponseReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly responseStartAllowed: boolean;
  readonly receipts: readonly FollowupResponseReceipt[];
  readonly followupArtifactIds: readonly string[];
  readonly ballotArtifactIds: readonly string[];
  readonly publicUnknowns: readonly PublicUnknown[];
  readonly consensus: BallotVote | "incomplete";
  readonly drainState: "ready" | "incomplete";
  readonly incompleteReason: "plan_not_staged" | "plan_lineage_mismatch" | null;
};
export type StageFollowupAndResponseResult =
  | {
      readonly kind: "staged";
      readonly allowedFollowups: number;
      readonly selectedFollowups: number;
      readonly projectedPhysicalLaunches: number;
      readonly publicUnknowns: readonly PublicUnknown[];
    }
  | {
      readonly kind: "blocked";
      readonly reason:
        | "accepted_challenge_set_incomplete"
        | "cross_run_or_snapshot_challenge"
        | "challenge_artifact_authentication_failed"
        | "physical_launch_budget_exhausted";
    };
export type FollowupAndResponseRoundOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
};
export interface SqliteFollowupAndResponseRound {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly stage: (input: {
    readonly runId: z.infer<typeof RunIdSchema>;
    readonly challengeArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
  }) => Promise<StageFollowupAndResponseResult>;
  readonly advance: (runId: string) => Promise<FollowupAndResponseReplay>;
  readonly drain: (runId: string) => Promise<FollowupAndResponseReplay>;
  readonly replay: (runId: string) => FollowupAndResponseReplay;
  readonly close: () => Promise<void>;
}

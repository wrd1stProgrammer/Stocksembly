import { z } from "zod";
import { BlindChallengeOutputSchema } from "../domain/agentOutputs";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { HashSchema } from "../domain/evidenceSchemas";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";

export const ChallengeDepartmentIdSchema = z.enum(WORKFLOW_V1_DEPARTMENT_IDS);
export type ChallengeDepartmentId = z.infer<typeof ChallengeDepartmentIdSchema>;

export const CHALLENGE_ASSIGNMENTS = [
  {
    challengerId: "market",
    targetDepartmentId: "financial",
    targetScope: "financial_scenario_assumptions",
  },
  {
    challengerId: "company",
    targetDepartmentId: "risk",
    targetScope: "risk_severity_business_consequences",
  },
  {
    challengerId: "financial",
    targetDepartmentId: "company",
    targetScope: "company_operating_evidence_assertions",
  },
  {
    challengerId: "risk",
    targetDepartmentId: "market",
    targetScope: "market_macro_operational_valuation",
  },
] as const;

const BlindTargetSchema = z
  .object({
    claimId: ClaimIdSchema,
    publicSummary: BilingualPublicTextSchema,
    evidenceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
    candidateCounterevidenceArtifactIds: z
      .array(ArtifactIdSchema)
      .min(1)
      .max(64)
      .readonly(),
    materiality: z.literal("material"),
  })
  .strict()
  .readonly();

const BlindCounterpointSchema = z
  .object({
    claimId: ClaimIdSchema,
    publicSummary: BilingualPublicTextSchema,
    evidenceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();

const ChallengeSourceArtifactSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    contentHash: HashSchema,
    relation: z.enum(["target_consolidation", "target_memo", "counter_memo"]),
  })
  .strict()
  .readonly();

export const ChallengeJobPromptSchema = z
  .object({
    kind: z.literal("blind_challenge_input_v1"),
    assignment: z
      .object({
        challengerId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
        targetScope: z.enum([
          "financial_scenario_assumptions",
          "risk_severity_business_consequences",
          "company_operating_evidence_assertions",
          "market_macro_operational_valuation",
        ]),
      })
      .strict()
      .readonly(),
    sourceArtifactIds: z.array(ArtifactIdSchema).min(2).max(3).readonly(),
    sourceArtifacts: z
      .array(ChallengeSourceArtifactSchema)
      .length(3)
      .readonly(),
    target: BlindTargetSchema,
    counterpoint: BlindCounterpointSchema,
  })
  .strict()
  .readonly();
export type ChallengeJobPrompt = z.infer<typeof ChallengeJobPromptSchema>;

export const ChallengeDecisionSchema = BlindChallengeOutputSchema.unwrap()
  .omit({ publicChallenge: true })
  .readonly();

export const PersistedChallengeJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    challengerId: ChallengeDepartmentIdSchema,
    targetDepartmentId: ChallengeDepartmentIdSchema,
    jobId: JobIdSchema,
    logicalArtifactId: z.string().regex(/^challenge:[a-z_]+$/),
    prompt: z.string().min(1),
    inputHash: HashSchema,
    inputManifestHash: HashSchema,
    citableArtifactIds: z.array(ArtifactIdSchema).min(2).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedChallengeJob = z.infer<typeof PersistedChallengeJobSchema>;

export type StageChallengeRoundResult =
  | { readonly kind: "staged"; readonly jobIds: readonly string[] }
  | {
      readonly kind: "blocked";
      readonly reason:
        | "accepted_consolidation_set_incomplete"
        | "cross_run_or_snapshot_consolidation"
        | "consolidation_artifact_authentication_failed"
        | "blind_input_unsafe"
        | "counterevidence_unavailable";
    };

export type ChallengeDurableReceipt = {
  readonly ordinal: number;
  readonly challengerId: ChallengeDepartmentId;
  readonly attemptId: string;
  readonly outcome: string;
  readonly evidenceRecorded: boolean;
};

export type ChallengeRoundReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly responseStartAllowed: boolean;
  readonly receipts: readonly ChallengeDurableReceipt[];
  readonly artifactIds: readonly string[];
  readonly committedChallengerIds: readonly ChallengeDepartmentId[];
  readonly eventSequences: readonly number[];
};

export type SqliteChallengeRoundOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
};

export interface SqliteChallengeRound {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly stage: (input: {
    readonly runId: z.infer<typeof RunIdSchema>;
    readonly consolidationArtifactIds: readonly z.infer<
      typeof ArtifactIdSchema
    >[];
  }) => Promise<StageChallengeRoundResult>;
  readonly drain: (runId: string) => Promise<ChallengeRoundReplay>;
  readonly replay: (runId: string) => ChallengeRoundReplay;
  readonly close: () => Promise<void>;
}

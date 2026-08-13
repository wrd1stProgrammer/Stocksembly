import { z } from "zod";
import { MemoOutputSchema } from "../domain/agentOutputs";
import { HashSchema } from "../domain/evidenceSchemas";
import {
  ArtifactIdSchema,
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

export const DepartmentIdSchema = z.enum(WORKFLOW_V1_DEPARTMENT_IDS);
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

const MemoOwnershipSchema = z
  .object({ roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS) })
  .strict()
  .readonly();

const DepartmentMemberArtifactSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    contentHash: HashSchema,
    ownership: MemoOwnershipSchema,
    memo: MemoOutputSchema,
  })
  .strict()
  .readonly();

export const DepartmentJobPromptSchema = z
  .object({
    kind: z.literal("department_consolidation_input_v1"),
    department: z
      .object({
        id: DepartmentIdSchema,
        leadId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
        memberIds: z.array(z.enum(WORKFLOW_V1_SPECIALIST_IDS)).min(2).max(3),
      })
      .strict()
      .readonly(),
    memberArtifacts: z
      .array(DepartmentMemberArtifactSchema)
      .min(2)
      .max(3)
      .readonly(),
    editorialBrief: z.string().trim().min(1).max(8_000).optional(),
  })
  .strict()
  .readonly();
export type DepartmentJobPrompt = z.infer<typeof DepartmentJobPromptSchema>;

export const PersistedDepartmentJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    departmentId: DepartmentIdSchema,
    leadId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    jobId: JobIdSchema,
    logicalArtifactId: z.string().regex(/^consolidation:[a-z_]+$/),
    prompt: z.string().min(1),
    inputHash: HashSchema,
    inputManifestHash: HashSchema,
    memberArtifactIds: z.array(ArtifactIdSchema).min(2).max(3).readonly(),
    citableArtifactIds: z.array(ArtifactIdSchema).min(2).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedDepartmentJob = z.infer<
  typeof PersistedDepartmentJobSchema
>;

export type AcceptedMemoMetadata = {
  readonly roleId: (typeof WORKFLOW_V1_SPECIALIST_IDS)[number];
  readonly artifactId: z.infer<typeof ArtifactIdSchema>;
  readonly snapshotId: z.infer<typeof SnapshotIdSchema>;
  readonly contentHash: string;
};

export type StageDepartmentRoundInput = {
  readonly runId: z.infer<typeof RunIdSchema>;
  readonly memberArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
};

export type StageDepartmentRoundResult =
  | { readonly kind: "staged"; readonly jobIds: readonly string[] }
  | {
      readonly kind: "blocked";
      readonly reason:
        | "accepted_specialist_set_incomplete"
        | "cross_run_or_snapshot_member"
        | "member_artifact_authentication_failed";
    };

export type DepartmentDurableReceipt = {
  readonly ordinal: number;
  readonly departmentId: DepartmentId;
  readonly attemptId: string;
  readonly outcome: string;
  readonly evidenceRecorded: boolean;
};

export type DepartmentRoundReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly challengeStartAllowed: boolean;
  readonly receipts: readonly DepartmentDurableReceipt[];
  readonly artifactIds: readonly string[];
  readonly committedDepartmentIds: readonly DepartmentId[];
  readonly eventSequences: readonly number[];
};

export type SqliteDepartmentRoundOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
};

export interface SqliteDepartmentRound {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly acceptedMemos: (runId: string) => readonly AcceptedMemoMetadata[];
  readonly stage: (
    input: StageDepartmentRoundInput,
  ) => Promise<StageDepartmentRoundResult>;
  readonly drain: (runId: string) => Promise<DepartmentRoundReplay>;
  readonly replay: (runId: string) => DepartmentRoundReplay;
  readonly close: () => Promise<void>;
}

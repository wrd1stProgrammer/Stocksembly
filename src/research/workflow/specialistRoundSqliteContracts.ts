import { z } from "zod";
import type { SourceLocatorSchema } from "../domain/evidenceCoreSchemas";
import {
  ArtifactIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { SpecialistRoundInput } from "./specialistRound";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const PersistedSpecialistJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
    jobId: JobIdSchema,
    logicalArtifactId: z.string().regex(/^memo:[a-z_]+$/),
    prompt: z.string().min(1),
    inputHash: HashSchema,
    inputManifestHash: HashSchema,
    sourceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedSpecialistJob = z.infer<
  typeof PersistedSpecialistJobSchema
>;

export type SpecialistSourceArtifact = {
  readonly evidenceId: string;
  readonly artifactId: z.infer<typeof ArtifactIdSchema>;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly locator: z.infer<typeof SourceLocatorSchema>;
};

export type SqliteSpecialistRoundOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
};

export type SpecialistDurableReceipt = {
  readonly ordinal: number;
  readonly roleId: (typeof WORKFLOW_V1_SPECIALIST_IDS)[number];
  readonly attemptId: string;
  readonly outcome: string;
  readonly evidenceRecorded: boolean;
};

export type SpecialistRoundReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly departmentStartAllowed: boolean;
  readonly receipts: readonly SpecialistDurableReceipt[];
  readonly artifactIds: readonly string[];
  readonly eventSequences: readonly number[];
};

export interface SqliteSpecialistRound {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly stage: (
    input: SpecialistRoundInput,
    sources: readonly SpecialistSourceArtifact[],
  ) => Promise<void>;
  readonly drain: (runId: string) => Promise<SpecialistRoundReplay>;
  readonly replay: (runId: string) => SpecialistRoundReplay;
  readonly close: () => Promise<void>;
}

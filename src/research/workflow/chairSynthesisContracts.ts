import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";

const NO_TOOL_INSTRUCTIONS =
  "All permitted sentences and citations are in this request. Do not call tools or read files. Return only JSON matching the output schema. Synthesize an investment decision, not a company-description digest. Compare the base and competing hypotheses, explicitly retain disconfirming evidence, and use benchmark, peer, sector-index, and cross-asset context when those audited sentences are available. The ten_second_brief must be one concise sentence per locale that states the evidence posture, strongest driver, and decisive risk or condition; never lead with domicile, listing, headquarters, or a generic business description. Select only the sentenceIds needed for each section, preserve meaningful dissent, and do not claim the mandate question is missing because mandate.question is the controlling question.";

export const CHAIR_SECTION_KEYS = [
  "ten_second_brief",
  "supported_analysis",
  "operational_scenarios",
  "dissent_unknowns",
  "change_conditions",
] as const;

const SentenceSchema = z
  .object({
    sentenceId: z.string().min(1).max(160),
    kind: z.enum([
      "claim",
      "position",
      "ballot",
      "dissent",
      "unknown",
      "scenario",
      "change_condition",
    ]),
    claimIds: z.array(ClaimIdSchema).max(64).readonly(),
    sourceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
    text: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const ChairSynthesisPromptSchema = z
  .object({
    kind: z.literal("chair_synthesis_input_v1"),
    mandate: z
      .object({
        mandateHash: z.string().regex(/^[a-f0-9]{64}$/),
        question: z.string().min(1).max(500).optional(),
        scope: z.enum(["broad", "focused"]),
        locale: z.enum(["en", "ko"]),
        limitations: z
          .array(z.object({ kind: z.string(), detail: z.string() }).strict())
          .readonly(),
      })
      .strict()
      .readonly(),
    capabilities: z
      .array(
        z
          .object({
            key: z.string(),
            availability: z.enum([
              "available",
              "stale",
              "unavailable",
              "withheld_by_rights",
            ]),
          })
          .strict(),
      )
      .readonly(),
    auditedClaimIds: z.array(ClaimIdSchema).min(1).readonly(),
    departmentPositions: z
      .array(
        z
          .object({
            departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
            artifactId: ArtifactIdSchema,
          })
          .strict(),
      )
      .length(4)
      .readonly(),
    ballots: z
      .array(
        z
          .object({
            departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
            artifactId: ArtifactIdSchema,
            vote: z.enum([
              "support",
              "support_with_reservations",
              "oppose",
              "abstain",
            ]),
          })
          .strict(),
      )
      .length(4)
      .readonly(),
    dissentClaimIds: z.array(ClaimIdSchema).readonly(),
    unknownIds: z.array(z.string().uuid()).readonly(),
    scenarioIds: z.array(z.string().min(1).max(160)).readonly(),
    changeConditionClaimIds: z.array(ClaimIdSchema).readonly(),
    sourceArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
    sentences: z.array(SentenceSchema).min(1).max(256).readonly(),
    instructions: z.literal(NO_TOOL_INSTRUCTIONS).default(NO_TOOL_INSTRUCTIONS),
  })
  .strict()
  .readonly();
export type ChairSynthesisPrompt = z.infer<typeof ChairSynthesisPromptSchema>;

export const PersistedChairJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    jobId: JobIdSchema,
    logicalArtifactId: z.literal("chair_synthesis:chair"),
    prompt: z.string().min(1),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    citableArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedChairJob = z.infer<typeof PersistedChairJobSchema>;

export type ChairSynthesisReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly artifactIds: readonly string[];
  readonly receipts: readonly {
    readonly ordinal: number;
    readonly outcome: string;
    readonly evidenceRecorded: boolean;
  }[];
  readonly sectionIds: readonly string[];
  readonly characterActorId: "chair" | null;
  readonly publishable: boolean;
  readonly incompleteReason:
    | "chair_artifact_missing"
    | "replacement_exhausted"
    | null;
};
export type SqliteChairSynthesisOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly publishReport?: (request: {
    readonly runId: z.infer<typeof RunIdSchema>;
    readonly acceptedChairArtifactId: z.infer<typeof ArtifactIdSchema>;
    readonly fence: {
      readonly jobId: z.infer<typeof JobIdSchema>;
      readonly attemptId: string;
      readonly ordinal: number;
      readonly ownerId: string;
      readonly token: number;
    };
  }) => Promise<
    | { readonly kind: "published" }
    | { readonly kind: "incomplete"; readonly reason?: string }
  >;
};
export interface SqliteChairSynthesis {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly stage: (input: {
    readonly runId: z.infer<typeof RunIdSchema>;
  }) => Promise<
    | { readonly kind: "staged" }
    | { readonly kind: "blocked"; readonly reason: string }
  >;
  readonly drain: (runId: string) => Promise<ChairSynthesisReplay>;
  readonly replay: (runId: string) => ChairSynthesisReplay;
  readonly close: () => Promise<void>;
}

export { ChairSynthesisOutputSchema };

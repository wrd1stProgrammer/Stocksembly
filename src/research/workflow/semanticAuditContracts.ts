import { z } from "zod";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { hashBytes } from "../domain/contractHelpers";
import { EVIDENCE_SOURCES } from "../domain/evidenceSchemas";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";

const NO_TOOL_INSTRUCTIONS =
  "All permitted evidence is in this request. Do not call tools or read files. Return only JSON matching the output schema.";

const FixedEvidenceSliceSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    evidenceId: z.string().min(1),
    source: z.enum(EVIDENCE_SOURCES),
    retrievedAt: z.string().datetime(),
    availableAt: z.string().datetime(),
    locatorHash: z.string().regex(/^[a-f0-9]{64}$/),
    span: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
        textHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    exactText: z.string().min(1).max(4_000),
    relation: z.enum(["supporting", "opposing"]),
  })
  .strict()
  .superRefine((slice, context) => {
    if (slice.span.end <= slice.span.start)
      context.addIssue({ code: "custom", message: "invalid fixed slice span" });
    if (slice.span.end - slice.span.start !== slice.exactText.length)
      context.addIssue({
        code: "custom",
        message: "fixed slice text length mismatch",
      });
    if (hashBytes(slice.exactText) !== slice.span.textHash)
      context.addIssue({
        code: "custom",
        message: "fixed slice hash mismatch",
      });
  });

export const SemanticClaimInputSchema = z
  .object({
    claimId: ClaimIdSchema,
    materiality: z.enum(["material", "supporting"]),
    text: BilingualPublicTextSchema,
    evidence: z.array(FixedEvidenceSliceSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();
export const SemanticQuestionInputSchema = z
  .object({
    questionId: QuestionIdSchema,
    text: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const SemanticAuditPromptSchema = z
  .object({
    kind: z.literal("semantic_audit_input_v1"),
    structuralAuditHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceArtifactIds: z.array(ArtifactIdSchema).max(64).readonly(),
    claims: z.array(SemanticClaimInputSchema).min(1).max(128).readonly(),
    questions: z.array(SemanticQuestionInputSchema).max(32).readonly(),
    instructions: z.literal(NO_TOOL_INSTRUCTIONS).default(NO_TOOL_INSTRUCTIONS),
  })
  .strict()
  .readonly();
export type SemanticAuditPrompt = z.infer<typeof SemanticAuditPromptSchema>;

export const SemanticAuditModelOutputSchema = z
  .object({
    kind: z.literal("semantic_audit"),
    verdicts: z
      .array(
        z.object({
          claimId: ClaimIdSchema,
          verdict: z.enum([
            "entailed",
            "partial",
            "contradicted",
            "not_assessable",
          ]),
          contradictionSeverity: z.enum(["none", "limited", "severe"]),
          publicExplanation: BilingualPublicTextSchema,
        }),
      )
      .min(1)
      .max(128)
      .readonly(),
    questionCoverage: z
      .array(
        z.object({
          questionId: QuestionIdSchema,
          status: z.enum(["covered", "partial", "uncovered"]),
          claimIds: z.array(ClaimIdSchema).max(64).readonly(),
        }),
      )
      .max(32)
      .readonly(),
  })
  .readonly();

export function semanticAuditModelPrompt(prompt: SemanticAuditPrompt): string {
  const evidenceCatalog: {
    readonly evidenceKey: string;
    readonly exactText: string;
  }[] = [];
  const keys = new Map<string, string>();
  const evidenceKey = (exactText: string): string => {
    const existing = keys.get(exactText);
    if (existing !== undefined) return existing;
    const key = `e${evidenceCatalog.length + 1}`;
    keys.set(exactText, key);
    evidenceCatalog.push({ evidenceKey: key, exactText });
    return key;
  };
  return JSON.stringify({
    kind: prompt.kind,
    claims: prompt.claims.map((claim) => ({
      claimId: claim.claimId,
      materiality: claim.materiality,
      text: claim.text,
      evidence: claim.evidence.map((evidence) => ({
        evidenceKey: evidenceKey(evidence.exactText),
        relation: evidence.relation,
      })),
    })),
    evidenceCatalog,
    questions: prompt.questions,
    instructions: prompt.instructions,
  });
}

export const PersistedSemanticAuditJobSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    jobId: JobIdSchema,
    logicalArtifactId: z.literal("semantic_audit:system"),
    prompt: z.string().min(1),
    validationPrompt: z.string().min(1).optional(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    citableArtifactIds: z.array(ArtifactIdSchema).min(1).max(64).readonly(),
  })
  .strict()
  .readonly();
export type PersistedSemanticAuditJob = z.infer<
  typeof PersistedSemanticAuditJobSchema
>;

export type SemanticAuditReceipt = {
  readonly ordinal: number;
  readonly outcome: string;
  readonly evidenceRecorded: boolean;
};
export type SemanticAuditReplay = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly artifactIds: readonly string[];
  readonly receipts: readonly SemanticAuditReceipt[];
  readonly claims: readonly {
    readonly claimId: string;
    readonly disposition: "verified" | "partial" | "removed" | "unresolved";
    readonly verdict:
      | "entailed"
      | "partial"
      | "contradicted"
      | "not_assessable";
  }[];
  readonly questionCoverage: readonly {
    readonly questionId: string;
    readonly status: "covered" | "partial" | "uncovered";
  }[];
  readonly publishable: boolean;
  readonly blockers: readonly string[];
  readonly characterActorId: null;
  readonly drainState: "ready" | "incomplete";
  readonly incompleteReason:
    | "semantic_artifact_missing"
    | "replacement_exhausted"
    | "retry_pending"
    | null;
};

export type SqliteSemanticAuditOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
};
export const SemanticAuditStageInputSchema = z
  .object({
    runId: RunIdSchema,
    structuralAuditArtifactId: ArtifactIdSchema,
    questions: z.array(QuestionIdSchema).max(32).readonly(),
  })
  .strict()
  .readonly();
export type SemanticAuditStageInput = z.infer<
  typeof SemanticAuditStageInputSchema
>;
export type SemanticAuditStageBlockedReason =
  | "invalid_input"
  | "accepted_workflow_set_incomplete"
  | "structural_artifact_missing"
  | "cross_run_or_snapshot_structural"
  | "structural_content_mismatch"
  | "invalid_structural_artifact"
  | "claim_set_mismatch"
  | "evidence_artifact_missing"
  | "cross_run_or_snapshot_evidence"
  | "evidence_content_mismatch"
  | "locator_hash_mismatch"
  | "evidence_span_mismatch"
  | "claim_set_immutable";
export interface SqliteSemanticAudit {
  readonly authority: "sqlite-worker-trusted-commit";
  readonly stage: (input: SemanticAuditStageInput) => Promise<
    | { readonly kind: "staged" }
    | {
        readonly kind: "blocked";
        readonly reason: SemanticAuditStageBlockedReason;
      }
  >;
  readonly drain: (runId: string) => Promise<SemanticAuditReplay>;
  readonly replay: (runId: string) => SemanticAuditReplay;
  readonly close: () => Promise<void>;
}

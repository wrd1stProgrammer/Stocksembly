import { z } from "zod";
import { AtomicClaimSchema } from "../domain/claims";
import { EVIDENCE_SOURCES } from "../domain/evidenceSchemas";
import { ResearchMetricSnapshotSchema } from "../domain/metricSnapshot";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";

const UuidSchema = z.string().uuid();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const StructuralMetricSchema = z
  .object({
    id: z.string().min(1),
    passed: z.number().int().nonnegative(),
    denominator: z.number().int().positive(),
  })
  .strict();

export const StructuralEvidenceSliceSchema = z
  .object({
    artifactId: UuidSchema,
    evidenceId: z.string().min(1),
    source: z.enum(EVIDENCE_SOURCES),
    retrievedAt: z.string().datetime(),
    availableAt: z.string().datetime(),
    locatorHash: HashSchema,
    span: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
        textHash: HashSchema,
      })
      .strict(),
    exactText: z.string().min(1),
    relation: z.enum(["supporting", "opposing"]),
  })
  .strict();

export const StructuralAuditResultSchema = z
  .object({
    runId: UuidSchema,
    snapshotId: UuidSchema,
    marketSnapshot: z
      .object({
        providerCode: z.string().trim().min(1).max(240),
        lastPrice: z.number().positive(),
        change: z.number().finite().optional(),
        changePercent: z.number().finite().optional(),
        currency: z.string().trim().min(3).max(8),
        observedAt: z.string().datetime(),
        marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
      })
      .strict()
      .optional(),
    metricSnapshot: ResearchMetricSnapshotSchema.optional(),
    metrics: z.array(StructuralMetricSchema).readonly(),
    blockers: z.array(z.string().min(1)).readonly(),
    claims: z.array(AtomicClaimSchema).min(1).readonly(),
    acceptedRoleIds: z.array(z.enum(WORKFLOW_V1_SPECIALIST_IDS)).readonly(),
    retainedDissentClaimIds: z.array(UuidSchema).readonly(),
    retainedOpenQuestionIds: z.array(UuidSchema).readonly(),
    retainedOpenQuestions: z
      .array(
        z
          .object({
            questionId: UuidSchema,
            text: z.object({ en: z.string(), ko: z.string() }).strict(),
          })
          .strict(),
      )
      .readonly(),
    capabilities: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(240),
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
    scenarios: z
      .array(
        z
          .object({
            field: z.string().trim().min(1).max(240),
            value: z.string(),
          })
          .strict(),
      )
      .readonly(),
    claimSetHash: HashSchema,
    fixedEvidenceSlices: z
      .array(
        z
          .object({
            claimId: UuidSchema,
            materiality: z.literal("material"),
            text: z.object({ en: z.string(), ko: z.string() }).strict(),
            evidence: z.array(StructuralEvidenceSliceSchema).readonly(),
          })
          .strict(),
      )
      .readonly(),
    publishable: z.boolean(),
    auditHash: HashSchema,
  })
  .strict();

export const StructuralAuditArtifactEnvelopeSchema = z
  .object({
    kind: z.literal("structural_audit"),
    schemaVersion: z.literal("workflow-v1"),
    runId: UuidSchema,
    snapshotId: UuidSchema,
    auditHash: HashSchema,
    claimSetHash: HashSchema,
    publishable: z.boolean(),
    result: StructuralAuditResultSchema,
  })
  .strict();

export const PersistedStructuralAuditSchema = z
  .object({
    kind: z.literal("persisted"),
    structuralAuditArtifactId: UuidSchema,
    structuralAuditContentHash: HashSchema,
    auditHash: HashSchema,
    runId: UuidSchema,
    snapshotId: UuidSchema,
    claimSetHash: HashSchema,
    publishable: z.boolean(),
  })
  .strict();

export const StructuralAuditBlockedSchema = z
  .object({
    kind: z.literal("blocked"),
    reason: z.enum([
      "invalid_input",
      "run_not_ready",
      "mandatory_role_missing",
      "accepted_workflow_set_incomplete",
      "workflow_artifact_authentication_failed",
      "evidence_artifact_missing",
      "cross_run_or_snapshot_evidence",
      "artifact_content_mismatch",
      "locator_hash_mismatch",
      "claim_set_immutable",
    ]),
  })
  .strict();

export const PersistStructuralAuditResultSchema = z.discriminatedUnion("kind", [
  PersistedStructuralAuditSchema,
  StructuralAuditBlockedSchema,
]);

export type StructuralAuditArtifactEnvelope = z.infer<
  typeof StructuralAuditArtifactEnvelopeSchema
>;
export type PersistStructuralAuditResult = z.infer<
  typeof PersistStructuralAuditResultSchema
>;

export type StructuralAuditPersistenceOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly cas: ArtifactCasPort;
  readonly now?: () => string;
};

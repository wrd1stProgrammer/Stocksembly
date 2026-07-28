import { z } from "zod";
import { AtomicClaimSchema } from "../domain/claims";
import { EVIDENCE_SOURCES } from "../domain/evidenceSchemas";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { ValueRecordSchema } from "../domain/valueRegistry";

const UuidSchema = z.string().uuid();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const IdSchema = z.string().trim().min(1).max(240);
const OpenQuestionSchema = z
  .object({
    questionId: UuidSchema,
    text: z
      .object({
        en: z.string().trim().min(1).max(4_000),
        ko: z.string().trim().min(1).max(4_000),
      })
      .strict(),
  })
  .strict();

export const StructuralAuditInputSchema = z
  .object({
    runId: UuidSchema,
    snapshotId: UuidSchema,
    evidenceCutoffAt: z.string().datetime(),
    marketSnapshot: z
      .object({
        providerCode: IdSchema,
        lastPrice: z.number().positive(),
        currency: z.string().trim().min(3).max(8),
        observedAt: z.string().datetime(),
        marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
      })
      .strict()
      .optional(),
    claims: z
      .array(
        z
          .object({
            claim: AtomicClaimSchema,
            atomicFactCount: z.number().int().positive(),
            requiresOpposingEvidence: z.boolean(),
            numericAssertions: z
              .array(
                z
                  .object({
                    valueId: IdSchema,
                    renderedValue: z.string().min(1),
                  })
                  .strict(),
              )
              .max(64)
              .readonly(),
            capabilityFields: z
              .array(
                z.object({ capability: IdSchema, field: IdSchema }).strict(),
              )
              .max(32)
              .readonly(),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(128)
      .readonly(),
    evidence: z
      .array(
        z
          .object({
            evidenceId: IdSchema,
            artifactId: UuidSchema,
            runId: UuidSchema,
            snapshotId: UuidSchema,
            source: z.enum(EVIDENCE_SOURCES),
            surface: z.enum(["model_transfer", "ui_report", "export"]),
            locatorHash: HashSchema,
            content: z.string().min(1),
            contentHash: HashSchema,
            span: z
              .object({
                start: z.number().int().nonnegative(),
                end: z.number().int().positive(),
                textHash: HashSchema,
              })
              .strict()
              .nullable(),
            retrievedAt: z.string().datetime(),
            availableAt: z.string().datetime(),
            cutoffPolicy: z
              .enum(["snapshot", "attempt_fenced_web"])
              .default("snapshot"),
            accession: z.string().min(1).optional(),
            activeAccession: z.string().min(1).optional(),
          })
          .strict()
          .readonly(),
      )
      .max(512)
      .readonly(),
    values: z
      .object({
        runId: UuidSchema,
        snapshotId: UuidSchema,
        records: z.array(ValueRecordSchema).readonly(),
      })
      .strict()
      .readonly(),
    acceptedMemos: z
      .array(
        z
          .object({
            roleId: z.enum(WORKFLOW_V1_SPECIALIST_IDS),
            artifactId: UuidSchema,
            runId: UuidSchema,
            snapshotId: UuidSchema,
          })
          .strict(),
      )
      .readonly(),
    sourceDissentClaimIds: z.array(UuidSchema).readonly(),
    retainedDissentClaimIds: z.array(UuidSchema).readonly(),
    sourceOpenQuestionIds: z.array(UuidSchema).readonly(),
    retainedOpenQuestionIds: z.array(UuidSchema).readonly(),
    sourceOpenQuestions: z.array(OpenQuestionSchema).max(32).readonly(),
    retainedOpenQuestions: z.array(OpenQuestionSchema).max(32).readonly(),
    localizedClaimIds: z
      .object({
        en: z.array(UuidSchema).readonly(),
        ko: z.array(UuidSchema).readonly(),
      })
      .strict(),
    capabilities: z
      .array(
        z
          .object({
            key: IdSchema,
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
      .array(z.object({ field: IdSchema, value: z.string() }).strict())
      .readonly(),
  })
  .strict()
  .readonly();

export type StructuralAuditInput = z.infer<typeof StructuralAuditInputSchema>;
export type StructuralMetric = {
  readonly id: string;
  readonly passed: number;
  readonly denominator: number;
};

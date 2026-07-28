import { z } from "zod";
import {
  hashCanonical,
  isStrictRfc3339,
  timestampMillis,
} from "./contractHelpers";

const UuidSchema = z.string().uuid();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const TimestampSchema = z
  .string()
  .refine(isStrictRfc3339, "invalid RFC3339 timestamp");

export const LocalizedClaimTextSchema = z
  .object({
    en: z.string().trim().min(1).max(4_000),
    ko: z.string().trim().min(1).max(4_000),
  })
  .strict();
export type LocalizedClaimText = z.infer<typeof LocalizedClaimTextSchema>;
export const ClaimEvidenceLinkSchema = z
  .object({
    evidenceId: z.string().trim().min(1).max(240),
    locatorHash: HashSchema,
    observationId: z.string().trim().min(1).max(240).optional(),
    valueId: z.string().trim().min(1).max(240).optional(),
    reason: z.string().trim().min(1).max(600).optional(),
  })
  .strict();
export type ClaimEvidenceLink = z.infer<typeof ClaimEvidenceLinkSchema>;
export const ChangeConditionSchema = z
  .object({
    en: z.string().trim().min(1).max(2_000),
    ko: z.string().trim().min(1).max(2_000),
    triggerEvidenceIds: z
      .array(z.string().trim().min(1).max(240))
      .max(32)
      .optional(),
  })
  .strict();
export type ChangeCondition = z.infer<typeof ChangeConditionSchema>;

export const AtomicClaimShape = z
  .object({
    kind: z.literal("atomic_claim"),
    claimId: UuidSchema,
    runId: UuidSchema,
    snapshotId: UuidSchema,
    reportVersionId: UuidSchema.optional(),
    text: LocalizedClaimTextSchema,
    epistemicClass: z.enum(["fact", "interpretation", "unknown"]),
    stance: z.enum(["positive", "mixed", "caution", "neutral"]),
    materiality: z.enum(["material", "supporting"]),
    claimType: z.string().trim().min(1).max(160),
    supportingEvidence: z.array(ClaimEvidenceLinkSchema).max(64),
    opposingEvidence: z.array(ClaimEvidenceLinkSchema).max(64),
    asOf: TimestampSchema,
    freshness: z.enum([
      "fresh",
      "aging",
      "stale",
      "superseded",
      "unavailable",
      "unknown",
    ]),
    oldestInputAt: TimestampSchema.optional(),
    newestInputAt: TimestampSchema.optional(),
    staleAfter: TimestampSchema.optional(),
    uncertainty: z.enum(["low", "medium", "high", "unknown"]),
    unknownReason: z.string().trim().min(1).max(600).optional(),
    changeCondition: ChangeConditionSchema.optional(),
    keyRisk: LocalizedClaimTextSchema.optional(),
    auditStatus: z.enum([
      "pending",
      "verified",
      "partial",
      "rejected",
      "removed",
    ]),
    auditReasons: z.array(z.string().trim().min(1).max(600)).max(32),
    unsupportedFragments: z.array(z.string().trim().min(1).max(600)).max(32),
    claimHash: HashSchema,
  })
  .strict();

export const AtomicClaimSchema = AtomicClaimShape.superRefine(
  (claim, context) => {
    const { claimHash: _claimHash, ...withoutHash } = claim;
    if (hashCanonical(withoutHash) !== claim.claimHash)
      context.addIssue({
        code: "custom",
        message: "claim hash does not match immutable content",
        path: ["claimHash"],
      });
    if (
      claim.oldestInputAt !== undefined &&
      claim.newestInputAt !== undefined &&
      timestampMillis(claim.oldestInputAt) >
        timestampMillis(claim.newestInputAt)
    )
      context.addIssue({
        code: "custom",
        message: "claim input freshness range is reversed",
        path: ["newestInputAt"],
      });
    if (claim.epistemicClass === "unknown" && claim.unknownReason === undefined)
      context.addIssue({
        code: "custom",
        message: "unknown claims require an explicit reason",
        path: ["unknownReason"],
      });
    if (claim.epistemicClass !== "unknown" && claim.unknownReason !== undefined)
      context.addIssue({
        code: "custom",
        message: "unknownReason is only valid for unknown claims",
        path: ["unknownReason"],
      });
  },
);
export type AtomicClaim = z.infer<typeof AtomicClaimSchema>;

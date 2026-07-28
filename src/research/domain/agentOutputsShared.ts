import { z } from "zod";
import { ArtifactIdSchema, ClaimIdSchema } from "./ids";

const URL_PATTERN =
  /(?:\b[a-z][a-z0-9+.-]{1,31}:(?:\/\/|[^\s])|(?:^|\s)\/\/[^\s]|\bwww\.)/i;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export const PublicModelTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine(
    (value) => !containsControlCharacter(value),
    "control characters are not public text",
  )
  .refine((value) => !URL_PATTERN.test(value), "URLs are not model payloads");

export const BilingualPublicTextSchema = z
  .object({ en: PublicModelTextSchema, ko: PublicModelTextSchema })
  .strict()
  .readonly();

export const SourceArtifactIdsSchema = z
  .array(ArtifactIdSchema)
  .min(1)
  .max(64)
  .refine(
    (values) => new Set(values).size === values.length,
    "duplicate source",
  )
  .readonly();

export const ClaimIdsSchema = z
  .array(ClaimIdSchema)
  .min(1)
  .max(64)
  .refine((values) => new Set(values).size === values.length, "duplicate claim")
  .readonly();

export const PublicPositionSchema = z
  .object({
    claimId: ClaimIdSchema,
    stance: z.enum(["supports", "opposes", "uncertain"]),
    publicSummary: BilingualPublicTextSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
  })
  .strict()
  .readonly();

export const DissentSchema = z
  .object({
    claimId: ClaimIdSchema,
    publicSummary: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const DissentListSchema = z.array(DissentSchema).max(32).readonly();
export const UnknownListSchema = z
  .array(BilingualPublicTextSchema)
  .max(32)
  .readonly();

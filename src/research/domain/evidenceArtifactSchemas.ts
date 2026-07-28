import { z } from "zod";
import { hashBytes, hashCanonical, timestampMillis } from "./contractHelpers";
import {
  HashSchema,
  SourceLocatorSchema,
  TimestampSchema,
  UuidSchema,
} from "./evidenceCoreSchemas";

const CommonArtifactSchema = z
  .object({
    artifactId: z.string().trim().min(1).max(240),
    runId: UuidSchema,
    snapshotId: UuidSchema,
    parentHashes: z.array(HashSchema).max(32),
    contentHash: HashSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const RawArtifactInputSchema = z
  .object({
    artifactId: z.string().trim().min(1).max(240),
    runId: UuidSchema,
    snapshotId: UuidSchema,
    statusCode: z.number().int().min(100).max(599),
    body: z.string().refine((value) => value.trim().length > 0, "empty body"),
    retrievedAt: TimestampSchema,
    sourcePublishedAt: TimestampSchema.optional(),
    locator: SourceLocatorSchema,
  })
  .strict();
export type RawArtifactInput = z.infer<typeof RawArtifactInputSchema>;

type ArtifactWithContentHash = {
  readonly [key: string]: unknown;
  readonly contentHash?: string;
};
export function artifactContentHash(value: ArtifactWithContentHash): string {
  const { contentHash: _contentHash, ...envelope } = value;
  return hashCanonical(envelope);
}

export const RawArtifactSchema = CommonArtifactSchema.extend({
  kind: z.literal("raw"),
  statusCode: z.number().int().min(100).max(599),
  body: z.string().refine((value) => value.trim().length > 0, "empty body"),
  bodyHash: HashSchema,
  retrievedAt: TimestampSchema,
  sourcePublishedAt: TimestampSchema.optional(),
  releaseTimeAvailability: z.enum(["known", "unavailable"]),
  locator: SourceLocatorSchema,
  semanticStatus: z.enum(["accepted", "quarantined", "blocked"]),
})
  .strict()
  .superRefine((value, context) => {
    if (
      (value.sourcePublishedAt !== undefined) !==
      (value.releaseTimeAvailability === "known")
    )
      context.addIssue({
        code: "custom",
        message:
          "releaseTimeAvailability is known iff sourcePublishedAt exists",
        path: ["releaseTimeAvailability"],
      });
    if (
      value.sourcePublishedAt !== undefined &&
      timestampMillis(value.sourcePublishedAt) >
        timestampMillis(value.retrievedAt)
    )
      context.addIssue({
        code: "custom",
        message: "sourcePublishedAt must precede retrieval",
        path: ["sourcePublishedAt"],
      });
    if (hashBytes(value.body) !== value.bodyHash)
      context.addIssue({
        code: "custom",
        message: "bodyHash does not match the received body",
        path: ["bodyHash"],
      });
    if (artifactContentHash(value) !== value.contentHash)
      context.addIssue({
        code: "custom",
        message: "contentHash does not match the raw artifact envelope",
        path: ["contentHash"],
      });
    if (value.statusCode >= 200 && value.statusCode < 300) {
      if (value.semanticStatus !== "accepted")
        context.addIssue({
          code: "custom",
          message: "successful HTTP responses must be semantically accepted",
          path: ["semanticStatus"],
        });
    } else if (value.semanticStatus === "accepted") {
      context.addIssue({
        code: "custom",
        message: "non-success HTTP responses cannot be accepted",
        path: ["semanticStatus"],
      });
    }
  });
export type RawArtifact = z.infer<typeof RawArtifactSchema>;

export const NormalizedArtifactSchema = CommonArtifactSchema.extend({
  kind: z.literal("normalized"),
  content: z.string().min(1),
  sourceHashes: z.array(HashSchema).min(1).max(64),
  parserVersion: z.string().trim().min(1).max(128),
})
  .strict()
  .superRefine((value, context) => {
    if (value.parentHashes.length === 0)
      context.addIssue({
        code: "custom",
        message: "normalized artifacts require parent hashes",
        path: ["parentHashes"],
      });
    if (artifactContentHash(value) !== value.contentHash)
      context.addIssue({
        code: "custom",
        message: "contentHash does not match the normalized artifact envelope",
        path: ["contentHash"],
      });
  });
export type NormalizedArtifact = z.infer<typeof NormalizedArtifactSchema>;

export const AgentArtifactSchema = CommonArtifactSchema.extend({
  kind: z.literal("agent"),
  role: z.string().trim().min(1).max(80),
  content: z.string().min(1),
  inputManifestHash: HashSchema,
  schemaVersion: z.string().trim().min(1).max(64),
})
  .strict()
  .superRefine((value, context) => {
    if (value.parentHashes.length === 0)
      context.addIssue({
        code: "custom",
        message: "agent artifacts require parent hashes",
        path: ["parentHashes"],
      });
    if (artifactContentHash(value) !== value.contentHash)
      context.addIssue({
        code: "custom",
        message: "contentHash does not match the agent artifact envelope",
        path: ["contentHash"],
      });
  });
export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;

export const ReportArtifactSchema = CommonArtifactSchema.extend({
  kind: z.literal("report"),
  content: z.string().min(1),
  inputManifestHash: HashSchema,
  schemaVersion: z.string().trim().min(1).max(64),
})
  .strict()
  .superRefine((value, context) => {
    if (value.parentHashes.length === 0)
      context.addIssue({
        code: "custom",
        message: "report artifacts require parent hashes",
        path: ["parentHashes"],
      });
    if (artifactContentHash(value) !== value.contentHash)
      context.addIssue({
        code: "custom",
        message: "contentHash does not match the report artifact envelope",
        path: ["contentHash"],
      });
  });
export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

export const ArtifactSchema = z.union([
  RawArtifactSchema,
  NormalizedArtifactSchema,
  AgentArtifactSchema,
  ReportArtifactSchema,
]);
export type Artifact = z.infer<typeof ArtifactSchema>;

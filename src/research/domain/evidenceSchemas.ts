import { z } from "zod";
import { hashCanonical, timestampMillis } from "./contractHelpers";

export type {
  EvidenceDataset,
  EvidenceSource,
  SourceLocator,
} from "./evidenceCoreSchemas";
export {
  EVIDENCE_SOURCES,
  EVIDENCE_DATASETS,
  HashSchema,
  SourceLocatorSchema,
  TimestampSchema,
  UuidSchema,
} from "./evidenceCoreSchemas";

import {
  EVIDENCE_DATASETS,
  EVIDENCE_SOURCES,
  HashSchema,
  SourceLocatorSchema,
  TimestampSchema,
  UuidSchema,
} from "./evidenceCoreSchemas";

export const EvidenceRecordSchema = z
  .object({
    kind: z.literal("evidence_record"),
    evidenceId: z.string().trim().min(1).max(240),
    runId: UuidSchema,
    snapshotId: UuidSchema,
    source: z.enum(EVIDENCE_SOURCES),
    provider: z.string().trim().min(1).max(128),
    dataset: z.enum(EVIDENCE_DATASETS),
    evidenceKind: z.enum([
      "filing",
      "exhibit",
      "xbrl",
      "macro_release",
      "calculated_artifact",
      "other",
    ]),
    locator: SourceLocatorSchema,
    retrievedAt: TimestampSchema,
    sourcePublishedAt: TimestampSchema.optional(),
    releaseTimeAvailability: z.enum(["known", "unavailable"]),
    payloadHash: HashSchema,
    revisionKind: z.enum([
      "original",
      "amendment",
      "restatement",
      "correction",
      "removal",
      "republication",
    ]),
    amendsEvidenceId: z.string().trim().min(1).max(240).optional(),
    supersedesEvidenceIds: z.array(z.string().trim().min(1).max(240)).max(32),
    currentValidity: z.enum(["active", "superseded", "tombstoned", "disputed"]),
    recordHash: HashSchema,
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
    if (value.source !== value.locator.source)
      context.addIssue({
        code: "custom",
        message: "source and locator.source must match",
        path: ["source"],
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
    if (
      value.revisionKind === "original" &&
      value.amendsEvidenceId !== undefined
    )
      context.addIssue({
        code: "custom",
        message: "original evidence cannot amend another record",
        path: ["amendsEvidenceId"],
      });
    if (
      value.revisionKind === "amendment" &&
      value.amendsEvidenceId === undefined
    )
      context.addIssue({
        code: "custom",
        message: "amendment must identify its original",
        path: ["amendsEvidenceId"],
      });
    const { recordHash: _recordHash, ...withoutHash } = value;
    if (hashCanonical(withoutHash) !== value.recordHash)
      context.addIssue({
        code: "custom",
        message: "recordHash does not match immutable evidence fields",
        path: ["recordHash"],
      });
  });
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export type {
  AgentArtifact,
  Artifact,
  NormalizedArtifact,
  RawArtifact,
  RawArtifactInput,
  ReportArtifact,
} from "./evidenceArtifactSchemas";
export {
  AgentArtifactSchema,
  ArtifactSchema,
  artifactContentHash,
  NormalizedArtifactSchema,
  RawArtifactInputSchema,
  RawArtifactSchema,
  ReportArtifactSchema,
} from "./evidenceArtifactSchemas";

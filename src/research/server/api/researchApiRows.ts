import { z } from "zod";
import {
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import { RunStatusSchema } from "../../domain/runStateContracts";

export const CountRowSchema = z.object({
  count: z.number().int().nonnegative(),
});
export const IdempotencyRowSchema = z.object({
  request_hash: z.string().regex(/^[a-f0-9]{64}$/),
  result_json: z.string(),
});
export const RunRowSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  symbol: z.string(),
  locale: z.enum(["en", "ko"]),
  status: RunStatusSchema,
  last_event_seq: z.number().int().nonnegative(),
  created_at: z.string(),
  report_id: ReportIdSchema.nullable(),
});
export const EventRowSchema = z.object({
  sequence: z.number().int().positive(),
  event_type: z.string(),
  state_id: z.string(),
  occurred_at: z.string(),
  payload_json: z.string(),
});
export const EventPayloadSchema = z
  .object({
    summary: z.object({ en: z.string(), ko: z.string() }).strict().optional(),
    actorId: z.string().optional(),
    artifactId: z.string().optional(),
    logicalArtifactId: z.string().optional(),
    reportId: z.string().optional(),
    reportVersionId: z.string().optional(),
    participantIds: z.array(z.string()).default([]),
    claimIds: z.array(z.string()).default([]),
    sourceIds: z.array(z.string()).default([]),
    limitationIds: z.array(z.string()).default([]),
  })
  .strip();
export const ReportRowSchema = z.object({
  report_id: ReportIdSchema,
  artifact_id: z.string().uuid(),
  artifact_digest: z.string().regex(/^[a-f0-9]{64}$/),
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  version_id: ReportVersionIdSchema,
  version: z.number().int().positive(),
  status: z.enum(["complete", "complete_with_limitations", "incomplete"]),
  published_at: z.string(),
  public_payload_json: z.string(),
});

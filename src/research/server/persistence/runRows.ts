import { z } from "zod";
import {
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  ReportIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import { JobStatusSchema } from "../../domain/jobStateContracts";
import { RunStatusSchema } from "../../domain/runStateContracts";

export const RunRowSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  status: RunStatusSchema,
  last_event_seq: z.number().int().nonnegative(),
  created_at: z.string(),
  version: z.number().int().nonnegative(),
  remaining_base_calls: z.number().int().nonnegative(),
  requested_optional_calls: z.number().int().nonnegative(),
  requested_replacement_calls: z.number().int().nonnegative(),
  report_id: ReportIdSchema.nullable(),
  lineage_kind: z
    .enum(["same-snapshot-retry", "new-snapshot-follow-up"])
    .nullable(),
  parent_run_id: RunIdSchema.nullable(),
  prior_report_id: ReportIdSchema.nullable(),
});
export const JobRowSchema = z.object({
  job_id: JobIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  kind: z.enum(["research", "qa"]),
  logical_key: z.string(),
  input_hash: z.string(),
  status: JobStatusSchema,
  attempt_id: AttemptIdSchema.nullable(),
  lease_owner: z.string().nullable(),
  lease_token: z.number().int().nonnegative(),
  lease_expires_at: z.string().nullable(),
});
export const EventRowSchema = z.object({
  run_id: RunIdSchema,
  sequence: z.number().int().positive(),
  event_id: EventIdSchema,
  event_type: z.string(),
  state_id: z.string(),
  occurred_at: z.string(),
  payload_json: z.string(),
});
export const SequenceRowSchema = z.object({
  last_event_seq: z.number().int().positive(),
});

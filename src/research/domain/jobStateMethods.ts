import { JobIdSchema, SnapshotIdSchema } from "./ids";
import {
  JOB_STATUS,
  JobLineageSchema,
  type JobRecord,
  type JobRecordData,
  JobRecordSchema,
  type JobStatus,
  type RetryInput,
  type RetryResult,
} from "./jobStateContracts";

const terminalStatuses = new Set<JobStatus>([
  JOB_STATUS.cancelled,
  JOB_STATUS.succeeded,
  JOB_STATUS.failed,
]);
function createRetryJob(parent: JobRecordData, input: RetryInput): RetryResult {
  if (!terminalStatuses.has(parent.status))
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "only terminal jobs may create retries or follow-ups",
      },
    };
  const childSnapshot = input.snapshotId ?? parent.snapshotId;
  if (
    input.kind === "same-snapshot-retry" &&
    childSnapshot !== parent.snapshotId
  )
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "same-snapshot retry must reuse its parent snapshot",
      },
    };
  if (
    input.kind === "new-snapshot-follow-up" &&
    childSnapshot === parent.snapshotId
  )
    return {
      ok: false,
      error: {
        kind: "invalid_lineage",
        message: "follow-up must seal a new snapshot",
      },
    };
  const lineage = JobLineageSchema.parse({
    kind: input.kind,
    parentJobId: parent.jobId,
    parentSnapshotId: parent.snapshotId,
  });
  return {
    ok: true,
    job: withJobMethods(
      JobRecordSchema.parse({
        jobId: JobIdSchema.parse(input.childJobId ?? input.attemptId),
        runId: parent.runId,
        snapshotId: SnapshotIdSchema.parse(childSnapshot),
        kind: parent.kind,
        logicalKey: parent.logicalKey,
        status: JOB_STATUS.queued,
        createdAt: input.createdAt ?? parent.createdAt,
        lineage,
      }),
    ),
  };
}
export function withJobMethods(data: JobRecordData): JobRecord {
  return Object.freeze({
    ...data,
    retry: (input: RetryInput): RetryResult => createRetryJob(data, input),
  });
}

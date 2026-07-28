import type {
  EventId,
  JobId,
  ReportId,
  RunId,
  SnapshotId,
} from "../domain/ids";
import type { RunStatus } from "../domain/runStateContracts";

export type ChildRunJob = {
  readonly jobId: JobId;
  readonly kind: "research";
  readonly logicalKey: string;
  readonly inputHash: string;
  readonly createdAt: string;
};

export type ChildRunEvent = {
  readonly eventId: EventId;
  readonly type: string;
  readonly stateId: string;
  readonly occurredAt: string;
};

export type ChildRunCommand = {
  readonly parentRunId: RunId;
  readonly childRunId: RunId;
  readonly kind: "same-snapshot-retry" | "new-snapshot-follow-up";
  readonly snapshotId?: SnapshotId;
  readonly priorReportId?: ReportId;
  readonly createdAt: string;
  readonly initialJob: ChildRunJob;
  readonly event: ChildRunEvent;
};

export interface DurableChildRunStorePort {
  readonly createChildRun: (input: ChildRunCommand) => DurableChildRunRecord;
}

export type DurableChildRunRecord = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly status: RunStatus;
  readonly lastEventSeq: number;
  readonly createdAt: string;
  readonly version: number;
  readonly remainingBaseCalls: number;
  readonly requestedOptionalCalls: number;
  readonly requestedReplacementCalls: number;
  readonly reportId?: ReportId;
  readonly lineage?: {
    readonly kind: "same-snapshot-retry" | "new-snapshot-follow-up";
    readonly parentRunId: RunId;
  };
  readonly priorReportId?: ReportId;
};

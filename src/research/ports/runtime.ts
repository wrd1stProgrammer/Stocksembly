import type { AttemptId, RunId, SnapshotId } from "../domain/ids";
import type { PublicResearchEvent } from "../domain/publicEvent";

export interface SnapshotClockPort {
  readonly now: () => string;
}

export type CapacitySnapshot = {
  readonly availableBytes: number;
  readonly requiredBytes: number;
  readonly sufficient: boolean;
};

export interface DiskCapacityProbePort {
  readonly inspect: (requiredBytes: number) => Promise<CapacitySnapshot>;
}

export interface CancellationSignalPort {
  readonly cancelled: boolean;
  readonly reason?: string;
  readonly onCancelled: (listener: () => void) => () => void;
}

export type CodexRunRequest = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly attemptId: AttemptId;
  readonly schemaName: string;
  readonly input: Uint8Array;
  readonly timeoutMs: number;
  readonly cancellation: CancellationSignalPort;
};

export type CodexRunResult =
  | {
      readonly status: "succeeded";
      readonly output: Uint8Array;
      readonly exitCode: 0;
    }
  | {
      readonly status: "failed" | "cancelled" | "timed-out";
      readonly exitCode: number | null;
    };

export interface CodexRunnerPort {
  readonly run: (request: CodexRunRequest) => Promise<CodexRunResult>;
}

export interface PublicEventNotifierPort {
  readonly notify: (runId: RunId, event: PublicResearchEvent) => Promise<void>;
}

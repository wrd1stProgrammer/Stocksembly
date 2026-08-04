import type { AttemptId, JobId, RunId, SnapshotId } from "../domain/ids";
import { LIMITS } from "../domain/limits.constants";
import type { SafeProcessDiagnostics } from "../server/codex/codexErrors";
import type { SafeCodexRunnerPhase } from "../server/codex/codexErrors";
import type { SafeReadinessDiagnostics } from "../server/codex/readiness";
import type { JsonValue } from "../server/persistence/sqlite/safeJson";

export const LEASE_ENGINE_DEFAULTS = {
  activeRuns: LIMITS.admission.activeRuns,
  queuedRuns: 8,
  globalCodexProcesses: LIMITS.admission.globalCodexProcesses,
  leaseMs: 30_000,
  heartbeatMs: 10_000,
  inactivityMs: 10 * 60_000,
} as const;

export type WorkerAttempt = {
  readonly attemptId: AttemptId;
  readonly jobId: JobId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly kind: "research" | "qa";
  readonly ordinal: number;
};

export type QaCommitEnvelope = {
  readonly answer: JsonValue;
  readonly reportId: string;
  readonly reportVersionId: string;
  readonly reportArtifactId: string;
  readonly reportArtifactDigest: string;
  readonly inputHash: string;
  readonly promptHash: string;
  readonly schemaHash: string;
  readonly binaryHash: string;
  readonly cliVersion: string;
};

export type AttemptOutcome =
  | { readonly kind: "accepted"; readonly qa?: QaCommitEnvelope }
  | {
      readonly kind: "transient" | "repair";
      readonly retryAt: string;
      readonly code?: string;
      readonly diagnostics?: SafeProcessDiagnostics;
      readonly readiness?: SafeReadinessDiagnostics;
      readonly runner?: { readonly phase: SafeCodexRunnerPhase };
    }
  | {
      readonly kind: "attention";
      readonly code: string;
      readonly diagnostics?: SafeProcessDiagnostics;
      readonly readiness?: SafeReadinessDiagnostics;
      readonly runner?: { readonly phase: SafeCodexRunnerPhase };
    }
  | {
      readonly kind: "permanent";
      readonly code: string;
      readonly diagnostics?: SafeProcessDiagnostics;
      readonly readiness?: SafeReadinessDiagnostics;
      readonly runner?: { readonly phase: SafeCodexRunnerPhase };
    }
  | { readonly kind: "incomplete"; readonly code: string }
  | { readonly kind: "degraded"; readonly code: string };

export type AttemptActivity = () => void;

export interface AttemptHandler {
  readonly run: (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: AttemptActivity,
  ) => Promise<AttemptOutcome>;
  readonly afterCommit?: (
    attempt: WorkerAttempt,
    outcome: AttemptOutcome,
  ) => Promise<void>;
  readonly reconcile?: () => Promise<void>;
}

export interface WorkerClock {
  readonly now: () => string;
}

export interface WorkerIdentityFactory {
  readonly attemptId: () => AttemptId;
  readonly eventId: () => string;
}

export type PollResult =
  | {
      readonly kind:
        | "idle"
        | "capacity"
        | "incomplete"
        | "recovery-pending"
        | "stopping";
    }
  | {
      readonly kind: "handled";
      readonly attempt: WorkerAttempt;
      readonly outcome: AttemptOutcome;
      readonly committed: boolean;
      readonly coordinationPending: boolean;
    }
  | { readonly kind: "crashed"; readonly attempt: WorkerAttempt };

export type CapacityState = {
  readonly activeRuns: number;
  readonly queuedRuns: number;
  readonly activeCodexProcesses: number;
  readonly acceptsRun: boolean;
};

export type RunAdmissionResult =
  | { readonly kind: "admitted" }
  | {
      readonly kind: "queue_full";
      readonly activeRuns: number;
      readonly queuedRuns: number;
    };

export class WorkerCrashError extends Error {
  readonly name = "WorkerCrashError";
}

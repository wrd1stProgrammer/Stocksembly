import type { z } from "zod";
import type {
  CodexBrowsingPolicy,
  CodexModel,
  CodexReasoning,
  CodexRuntimeOverride,
  CodexStage,
} from "./codexPolicy";
import type {
  LaunchReservationClaim,
  LaunchReservationReader,
} from "./codexReservation";

export type CodexRunInput<Candidate> = {
  readonly attemptDir: string;
  readonly reservation: LaunchReservationClaim;
  readonly stage: CodexStage;
  readonly runtime?: CodexRuntimeOverride;
  readonly prompt: string;
  readonly outputSchema: z.ZodType<Candidate>;
  readonly signal?: AbortSignal;
  readonly onActivity?: () => void;
  readonly captureWebEvidence?: (
    input: AttemptWebEvidenceCapture,
  ) => Promise<boolean>;
};

export type CapturedWebArtifact = {
  readonly artifactId: string;
  readonly url: string;
  readonly title: string;
  readonly publisher: string;
  readonly retrievedAt: string;
  readonly excerpt: string;
  readonly contentHash: string;
  readonly content: Uint8Array;
};

export type AttemptWebEvidenceCapture = {
  readonly reservation: LaunchReservationClaim;
  readonly transcriptHash: string;
  readonly searchedUrls?: readonly string[];
  readonly artifacts: readonly CapturedWebArtifact[];
};

export type VerifiedFile = {
  readonly device: string;
  readonly inode: string;
  readonly hash: string;
  readonly byteLength: number;
  readonly userId: string;
  readonly groupId: string;
};

export type SafeCodexEvidence = {
  readonly ordinal: number;
  readonly stage: CodexStage;
  readonly model: CodexModel;
  readonly reasoning: CodexReasoning;
  readonly browsingPolicy: CodexBrowsingPolicy;
  readonly toolTranscriptHash: string;
  readonly binaryVersion: string;
  readonly binaryHash: string;
  readonly originDevice: string;
  readonly originInode: string;
  readonly linkDevice: string;
  readonly linkInode: string;
  readonly profileHash: string;
  readonly environmentHash: string;
  readonly argvHash: string;
  readonly schemaHash: string;
  readonly eventTypes: readonly string[];
  readonly exitCode: 0;
  readonly toolEventCount: number;
  readonly searchedUrls?: readonly string[];
  readonly cleanup: "complete";
};

export type CodexRunResult<Candidate> = {
  readonly candidate: Candidate;
  readonly evidence: SafeCodexEvidence;
};

export interface CodexPort {
  readonly id: "isolated-codex-cli";
  readonly kind: "real";
  readonly run: <Candidate>(
    input: CodexRunInput<Candidate>,
  ) => Promise<CodexRunResult<Candidate>>;
}

export type CodexPortDependencies = {
  readonly reservations: LaunchReservationReader;
};

export type SpawnInvocation = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>> & {
    readonly PATH: string;
  };
  readonly stdin: string;
  readonly timeoutMs: number | undefined;
  readonly inactivityTimeoutMs?: number;
  readonly killGraceMs: number;
  readonly signal?: AbortSignal;
  readonly onStdoutChunk?: (chunk: Uint8Array) => void;
  readonly onActivity?: () => void;
};

export type ProcessExecution = {
  readonly exitCode: number;
  readonly signal?: NodeJS.Signals | null;
  readonly stdout: readonly Uint8Array[];
  readonly stdoutBytes?: number;
  readonly stderrBytes: number;
  readonly durationMs?: number;
};

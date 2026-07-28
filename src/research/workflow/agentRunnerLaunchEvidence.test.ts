import { describe, expect, it } from "vitest";
import { TRUSTED_AGENT_RUNTIME_POLICY } from "../application/commitAgentOutputContracts";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../domain/ids";
import type { RecordAgentRunnerEvidenceInput } from "../ports/agentOutputCommit";
import { CODEX_RUNTIME_PINS } from "../server/codex/codexPolicy";
import type { CodexRunResult } from "../server/codex/codexTypes";
import {
  recordSuccessfulRunnerEvidence,
  runAndRecordSuccessfulRunnerEvidence,
} from "./agentRunnerLaunchEvidence";

const EMPTY_TOOL_TRANSCRIPT_HASH =
  "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570";
const TRUSTED_BINARY_HASH =
  "6d8be49e49751554df16572369e636cbe02c84b208cad3dc35528c846eeca223";

class RecordingEvidenceStore {
  readonly inputs: RecordAgentRunnerEvidenceInput[] = [];

  recordRunnerEvidence(input: RecordAgentRunnerEvidenceInput): boolean {
    this.inputs.push(input);
    return true;
  }
}

const binding = {
  runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  attemptId: AttemptIdSchema.parse("00000000-0000-4000-8000-000000000003"),
  ordinal: 7,
  ownerId: "worker-a",
  token: 4,
  now: "2026-07-24T00:00:00.000Z",
  stage: "blind_challenge",
  promptHash: "a".repeat(64),
  inputHash: "b".repeat(64),
} as const;

const validResult: CodexRunResult<{ readonly ok: true }> = {
  candidate: { ok: true },
  evidence: {
    ordinal: binding.ordinal,
    stage: binding.stage,
    model: "gpt-5.6-terra",
    reasoning: "medium",
    browsingPolicy: "audited_web",
    toolTranscriptHash: EMPTY_TOOL_TRANSCRIPT_HASH,
    binaryVersion: "codex-cli 0.146.0-alpha.3.1",
    binaryHash: TRUSTED_BINARY_HASH,
    originDevice: "1",
    originInode: "1",
    linkDevice: "1",
    linkInode: "1",
    profileHash: "c".repeat(64),
    environmentHash: "d".repeat(64),
    argvHash: "e".repeat(64),
    schemaHash: "f".repeat(64),
    eventTypes: ["thread.started", "turn.completed"],
    exitCode: 0,
    toolEventCount: 0,
    cleanup: "complete",
  },
};

describe("actual Codex runner launch evidence", () => {
  it("uses the same authenticated binary pin as the Codex runner", () => {
    expect(TRUSTED_AGENT_RUNTIME_POLICY.cliVersion).toBe(
      CODEX_RUNTIME_PINS.version,
    );
    expect(TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash).toBe(
      CODEX_RUNTIME_PINS.originSha256,
    );
  });

  it("refuses to persist mismatched successful runner evidence", () => {
    // Given
    const store = new RecordingEvidenceStore();
    const forged = {
      ...validResult.evidence,
      reasoning: "high",
    } as const;

    // When
    const recorded = recordSuccessfulRunnerEvidence(store, binding, forged);

    // Then
    expect(recorded).toBe(false);
    expect(store.inputs).toEqual([]);
  });

  it("does not persist successful provenance when the runner throws", async () => {
    // Given
    const store = new RecordingEvidenceStore();

    // When
    const result = await runAndRecordSuccessfulRunnerEvidence(
      store,
      binding,
      () => Promise.reject(new TypeError("injected runner failure")),
    );

    // Then
    expect(result).toBeUndefined();
    expect(store.inputs).toEqual([]);
  });
});

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import { type CodexRunInput, createCodexPort } from "./codexRunner";
import {
  FakeLaunchReservationStore,
  makeCodexTempDirectory,
} from "./codexRunnerTestSupport";
import {
  buildSafeReadinessReport,
  type ReadinessObservation,
} from "./readiness";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const PINNED_BINARY_HASH =
  "9de41fd67ac24873dd7852160536cff004633f76f224fed602654457da27db02";

function observation(): ReadinessObservation {
  return {
    evidence: {
      ordinal: 1,
      stage: "probe",
      model: "gpt-5.6-terra",
      reasoning: "medium",
      browsingPolicy: "disabled",
      toolTranscriptHash:
        "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      binaryVersion: "codex-cli 0.146.0-alpha.3.1",
      binaryHash: PINNED_BINARY_HASH,
      originDevice: "7",
      originInode: "11",
      linkDevice: "7",
      linkInode: "11",
      profileHash: HASH_A,
      environmentHash: HASH_A,
      argvHash: HASH_A,
      schemaHash: HASH_A,
      eventTypes: ["thread.started", "turn.started", "turn.completed"],
      exitCode: 0,
      toolEventCount: 0,
      cleanup: "complete",
    },
    expectedBinaryHash: PINNED_BINARY_HASH,
    expectedVersion: "codex-cli 0.146.0-alpha.3.1",
    sandboxHash: HASH_A,
    certificateHash: HASH_A,
    localeHash: HASH_A,
    disabledFeaturesHash: HASH_A,
    expectedDisabledFeaturesHash: HASH_A,
    allowedEvidenceHash: HASH_B,
    returnedEvidenceHash: HASH_B,
    artifactExposure: "clear",
    temporaryStorage: "writable_same_device",
    sandbox: "verified",
    certificate: "verified",
    locale: "verified",
    environment: "exact",
    disabledFeatures: "verified",
    login: "available",
    sentinelAccess: {
      allowedEvidence: "readable",
      project: "blocked",
      originalHome: "blocked",
      inheritedEnvironment: "blocked",
    },
  };
}

export function registerCorrectiveReadinessTests(): void {
  describe("corrective readiness gates", () => {
    it("gates the production port before reservation, link, or spawn work", async () => {
      // Given
      vi.stubEnv("STOCKSEMBLY_CODEX_BINARY", "/private/tmp/substitute");
      vi.stubEnv("LANG", "en_US.UTF-8");
      vi.stubEnv("LC_ALL", "en_US.UTF-8");
      const root = await makeCodexTempDirectory();
      const input: CodexRunInput<never> = {
        attemptDir: `${root.path}/production-gate-attempt`,
        reservation: {
          key: {
            runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000041"),
            jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000042"),
            attemptId: AttemptIdSchema.parse(
              "00000000-0000-4000-8000-000000000043",
            ),
            ordinal: 1,
          },
          fence: { ownerId: "production-readiness-test", token: 1 },
        },
        stage: "probe",
        prompt: "",
        outputSchema: z.never(),
      };
      const port = createCodexPort(new FakeLaunchReservationStore());
      try {
        // When
        const action = port.run(input);
        // Then
        await expect(action).rejects.toMatchObject({
          code: "CODEX_ISOLATION_FAILED",
        });
        await expect(realpath(input.attemptDir)).rejects.toBeDefined();
      } finally {
        vi.unstubAllEnvs();
        await root.cleanup();
      }
    });

    it("rejects unreadable allowed evidence", () => {
      // Given
      const input = {
        ...observation(),
        sentinelAccess: {
          ...observation().sentinelAccess,
          allowedEvidence: "blocked" as const,
        },
      };
      // When
      const action = () => buildSafeReadinessReport("worker_admission", input);
      // Then
      expect(action).toThrow(
        expect.objectContaining({ code: "CODEX_ISOLATION_FAILED" }),
      );
    });

    it("rejects unsafe path-bearing readiness metadata", () => {
      // Given
      const input = observation();
      const unsafe = {
        ...input,
        expectedVersion: "/Users/private/workspace",
        evidence: {
          ...input.evidence,
          binaryVersion: "/Users/private/workspace",
        },
      };
      // When
      const action = () => buildSafeReadinessReport("worker_admission", unsafe);
      // Then
      expect(action).toThrow(
        expect.objectContaining({ code: "CODEX_ISOLATION_FAILED" }),
      );
    });

    it("rejects a live disabled-feature inventory hash mismatch", () => {
      // Given
      const input = { ...observation(), disabledFeaturesHash: HASH_B };
      // When
      const action = () => buildSafeReadinessReport("worker_admission", input);
      // Then
      expect(action).toThrow(
        expect.objectContaining({ code: "CODEX_ISOLATION_FAILED" }),
      );
    });

    it("keeps the final evidence hash inventory fresh", async () => {
      // Given
      const evidencePath =
        ".omo/evidence/start-work/live-research-office/task-21/task-21-live-research-office.json";
      const inventory = await readFile(
        ".omo/evidence/start-work/live-research-office/task-21/hashes.log",
        "utf8",
      );
      // When
      const actualHash = createHash("sha256")
        .update(await readFile(evidencePath))
        .digest("hex");
      // Then
      expect(inventory).toContain(`${actualHash}  ${evidencePath}`);
    });
  });
}

import { realpath, rm, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import { CodexRunnerError } from "./codexErrors";
import type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
  SafeCodexEvidence,
} from "./codexRunner";
import {
  buildSafeReadinessReport,
  CodexIsolationError,
  createReadinessGuardedCodexPort,
  type ReadinessObservation,
} from "./readiness";
import { registerCorrectiveReadinessTests } from "./readinessCorrective.testCases";
import { assertExactReadinessEnvironment } from "./readinessEnvironment";
import {
  codexIsolationError,
  createReadinessRoot,
} from "./readinessProbeSupport";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const PINNED_BINARY_HASH =
  "fb2b6b35789e59c885cf4d2aee12475809dd67b2c10df580e638122fd6b3438e";

function observation(
  overrides: Partial<ReadinessObservation> = {},
): ReadinessObservation {
  const evidence: SafeCodexEvidence = {
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
  };
  return {
    evidence,
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
    ...overrides,
  };
}

describe("Codex readiness admission", () => {
  it("produces only allowlisted hashes, version, and statuses when every isolation check passes", () => {
    // Given
    const input = observation();

    // When
    const report = buildSafeReadinessReport("worker_admission", input);

    // Then
    expect(report).toMatchObject({
      status: "ready",
      scope: "worker_admission",
      binaryVersion: input.expectedVersion,
      binaryHash: PINNED_BINARY_HASH,
      originIdentityHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      linkIdentityHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      certificateHash: HASH_A,
      environmentHash: HASH_A,
      sentinelIsolation: "passed",
      noToolProbe: "passed",
      login: "passed",
      cleanup: "complete",
    });
    expect(JSON.stringify(report)).not.toMatch(
      /\/Users\/private-home|PROJECT_SECRET|HOME_SECRET|auth\.json/,
    );
  });

  it("validates a readiness report against the selected platform pins", () => {
    // Given
    const linuxHash = "c".repeat(64);
    const linuxVersion = "codex-cli linux";
    const input = observation({
      evidence: {
        ...observation().evidence,
        binaryHash: linuxHash,
        binaryVersion: linuxVersion,
      },
      expectedBinaryHash: linuxHash,
      expectedVersion: linuxVersion,
    });

    // When
    const report = buildSafeReadinessReport("worker_admission", input);

    // Then
    expect(report.binaryHash).toBe(linuxHash);
    expect(report.binaryVersion).toBe(linuxVersion);
  });

  it.each([
    [
      "binary hash drift",
      { evidence: { ...observation().evidence, binaryHash: HASH_B } },
    ],
    [
      "unknown version",
      { evidence: { ...observation().evidence, binaryVersion: "unknown" } },
    ],
    [
      "link replacement",
      { evidence: { ...observation().evidence, linkInode: "12" } },
    ],
    ["certificate drift", { certificate: "untrusted" }],
    ["locale drift", { locale: "unavailable" }],
    ["inherited environment", { environment: "inherited" }],
    ["sandbox profile drift", { sandbox: "unavailable" }],
    ["enabled disabled-feature", { disabledFeatures: "enabled" }],
    ["absent login", { login: "unavailable" }],
    ["sentinel echo", { artifactExposure: "detected" }],
    ["schema mismatch", { returnedEvidenceHash: HASH_A }],
    ["cross-device temp", { temporaryStorage: "unusable" }],
  ] as const)(
    "rejects %s with the typed isolation code",
    (_name, overrides) => {
      // Given
      const input = observation(overrides);

      // When
      const action = () => buildSafeReadinessReport("worker_admission", input);

      // Then
      expect(action).toThrow(
        expect.objectContaining({ code: "CODEX_ISOLATION_FAILED" }),
      );
    },
  );

  it("does not create a launch or fallback when the pre-launch probe fails", async () => {
    // Given
    let runCalls = 0;
    const inner: CodexPort = {
      id: "isolated-codex-cli",
      kind: "real",
      async run<Candidate>(
        _input: CodexRunInput<Candidate>,
      ): Promise<CodexRunResult<Candidate>> {
        runCalls += 1;
        throw new CodexIsolationError("probe");
      },
    };
    const guarded = createReadinessGuardedCodexPort(inner, async () => {
      throw new CodexIsolationError("environment");
    });
    const input: CodexRunInput<never> = {
      attemptDir: "/private/tmp/blocked-readiness-test",
      reservation: {
        key: {
          runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000031"),
          jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000032"),
          attemptId: AttemptIdSchema.parse(
            "00000000-0000-4000-8000-000000000033",
          ),
          ordinal: 1,
        },
        fence: { ownerId: "readiness-test", token: 1 },
      },
      stage: "probe",
      prompt: "",
      outputSchema: z.never(),
    };

    // When
    const action = guarded.run(input);

    // Then
    await expect(action).rejects.toMatchObject({
      code: "CODEX_ISOLATION_FAILED",
      check: "environment",
    });
    expect(runCalls).toBe(0);
  });

  it("maps an enabled tool event to the safe typed isolation code", () => {
    // Given
    const failure = new CodexRunnerError("tool_event");

    // When
    const mapped = codexIsolationError(failure);

    // Then
    expect(mapped).toMatchObject({
      code: "CODEX_ISOLATION_FAILED",
      check: "tool",
    });
  });

  it.each([
    ["inactivity_timeout", "probe"],
    ["network_unavailable", "probe"],
    ["rate_limited", "probe"],
    ["schema_invalid", "schema"],
    ["rights_denied", "probe"],
  ] as const)("maps %s to the safe %s readiness check", (code, check) => {
    // Given
    const failure = new CodexRunnerError(code);

    // When
    const mapped = codexIsolationError(failure);

    // Then
    expect(mapped).toMatchObject({
      code: "CODEX_ISOLATION_FAILED",
      check,
    });
  });

  it("rejects an inherited variable before a probe child can run", () => {
    // Given
    const attemptDir = "/private/tmp/readiness-environment-test";
    const invocation = {
      executable: "/usr/bin/sandbox-exec",
      argv: [],
      cwd: attemptDir,
      environment: {
        CODEX_HOME: `${attemptDir}/codex-home`,
        HOME: `${attemptDir}/home`,
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NO_COLOR: "1",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        SSL_CERT_FILE: "/etc/ssl/cert.pem",
        TMPDIR: `${attemptDir}/tmp`,
        STOCKSEMBLY_READINESS_SENTINEL: "private",
      },
      stdin: "",
      timeoutMs: 1,
      killGraceMs: 1,
    } satisfies import("./codexTypes").SpawnInvocation;

    // When
    const action = () =>
      assertExactReadinessEnvironment(
        invocation,
        attemptDir,
        "STOCKSEMBLY_READINESS_SENTINEL",
      );

    // Then
    expect(action).toThrow(
      expect.objectContaining({ code: "CODEX_ISOLATION_FAILED" }),
    );
  });

  it("accepts only the exact authenticated loopback proxy environment", () => {
    // Given
    const attemptDir = "/private/tmp/readiness-environment-proxy-test";
    const proxy = "http://readiness-user:readiness-password@127.0.0.1:43123";
    const invocation = {
      executable: "/usr/bin/sandbox-exec",
      argv: [],
      cwd: attemptDir,
      environment: {
        ALL_PROXY: proxy,
        CODEX_HOME: `${attemptDir}/codex-home`,
        HOME: `${attemptDir}/home`,
        HTTP_PROXY: proxy,
        HTTPS_PROXY: proxy,
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NO_COLOR: "1",
        NO_PROXY: "",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        SSL_CERT_FILE: "/etc/ssl/cert.pem",
        TMPDIR: `${attemptDir}/tmp`,
      },
      stdin: "",
      timeoutMs: 1,
      killGraceMs: 1,
    } satisfies import("./codexTypes").SpawnInvocation;

    // When
    const action = () =>
      assertExactReadinessEnvironment(
        invocation,
        attemptDir,
        "STOCKSEMBLY_READINESS_SENTINEL",
      );

    // Then
    expect(action).not.toThrow();
    expect(() =>
      assertExactReadinessEnvironment(
        {
          ...invocation,
          environment: {
            ...invocation.environment,
            HTTPS_PROXY:
              "http://readiness-user:readiness-password@127.0.0.1:43124",
          },
        },
        attemptDir,
        "STOCKSEMBLY_READINESS_SENTINEL",
      ),
    ).toThrow(expect.objectContaining({ check: "environment" }));
    expect(() =>
      assertExactReadinessEnvironment(
        {
          ...invocation,
          environment: {
            ...invocation.environment,
            ALL_PROXY:
              "http://readiness-user:readiness-password@10.0.0.1:43123",
            HTTP_PROXY:
              "http://readiness-user:readiness-password@10.0.0.1:43123",
            HTTPS_PROXY:
              "http://readiness-user:readiness-password@10.0.0.1:43123",
          },
        },
        attemptDir,
        "STOCKSEMBLY_READINESS_SENTINEL",
      ),
    ).toThrow(expect.objectContaining({ check: "environment" }));
  });

  it("creates a canonical temporary root accepted by descriptor traversal", async () => {
    // Given
    const root = await createReadinessRoot();

    try {
      // When
      const canonical = await realpath(root);

      // Then
      expect(root).toBe(canonical);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates the readiness root on a requested filesystem", async () => {
    const parent = await createReadinessRoot();
    const root = await createReadinessRoot(parent);

    try {
      const [parentStats, rootStats] = await Promise.all([
        stat(parent),
        stat(root),
      ]);
      expect(root.startsWith(`${parent}/`)).toBe(true);
      expect(rootStats.dev).toBe(parentStats.dev);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

registerCorrectiveReadinessTests();

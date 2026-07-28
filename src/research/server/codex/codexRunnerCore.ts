// allow: SIZE_OK — the security-critical isolated runner lifecycle stays linear for auditability.
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  schemaDocument,
  sha256Value,
  writeExclusiveJson,
} from "./codexArtifacts";
import { asCodexRunnerError, CodexRunnerError } from "./codexErrors";
import { CodexJsonlEarlyGuard, collectCodexJsonl } from "./codexJsonl";
import {
  protectCodexOrigin,
  verifyPinnedExecutable,
  verifyPinnedRegularFile,
} from "./codexOrigin";
import { assertHostPolicy, type CodexRunnerPlatform } from "./codexPlatform";
import {
  buildChildEnvironment,
  buildCodexArgv,
  CODEX_RUNTIME_POLICY,
  CODEX_STAGES,
} from "./codexPolicy";
import {
  codexInputHash,
  type LaunchReservationReader,
  verifyLaunchReservation,
} from "./codexReservation";
import { prepareEphemeralRuntime } from "./codexRuntime";
import { buildSandboxProfile, hashSandboxProfile } from "./codexSandbox";
import type {
  CodexRunInput,
  CodexRunResult,
  SafeCodexEvidence,
  SpawnInvocation,
} from "./codexTypes";

function sortedEnvironment(
  environment: Readonly<Record<string, string>>,
): readonly (readonly [string, string])[] {
  return Object.freeze(
    Object.entries(environment)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => Object.freeze([name, value] as const)),
  );
}

function validateRunInput<Candidate>(input: CodexRunInput<Candidate>): void {
  if (!CODEX_STAGES.some((stage) => stage === input.stage))
    throw new CodexRunnerError("policy_violation");
  if (
    input.runtime !== undefined &&
    (input.stage !== "qa" ||
      input.runtime.model !== "gpt-5.6-sol" ||
      input.runtime.reasoning !== "low")
  )
    throw new CodexRunnerError("policy_violation");
  if (
    typeof input.prompt !== "string" ||
    Buffer.byteLength(input.prompt, "utf8") >
      CODEX_RUNTIME_POLICY.maxPromptBytes ||
    !(input.outputSchema instanceof z.ZodType)
  )
    throw new CodexRunnerError("policy_violation");
}

function assertSignature(
  actual: {
    readonly identifier: string;
    readonly teamIdentifier: string;
    readonly codeDirectoryHash: string;
  },
  platform: CodexRunnerPlatform,
): void {
  if (
    actual.identifier !== platform.pins.codeIdentifier ||
    actual.teamIdentifier !== platform.pins.teamIdentifier ||
    actual.codeDirectoryHash !== platform.pins.codeDirectoryHash
  )
    throw new CodexRunnerError("origin_untrusted");
}

export async function runCodexWithPlatform<Candidate>(
  input: CodexRunInput<Candidate>,
  platform: CodexRunnerPlatform,
  reservations: LaunchReservationReader,
): Promise<CodexRunResult<Candidate>> {
  validateRunInput(input);
  const schema = schemaDocument(input.outputSchema);
  const inputHash = codexInputHash(input);
  const reservation = await verifyLaunchReservation(
    input.reservation,
    reservations,
    inputHash,
  );
  assertHostPolicy(platform.hostEnvironment, platform.pins.locale);
  const direct = platform.executionMode === "direct";
  if (!direct)
    await verifyPinnedExecutable(
      platform.pins.sandboxExecPath,
      platform.pins.sandboxExecSha256,
      "policy_violation",
    );
  await verifyPinnedRegularFile(
    platform.pins.certificatePath,
    platform.pins.certificateSha256,
    "policy_violation",
  );
  const protectedOrigin = await protectCodexOrigin({
    originPath: platform.pins.originPath,
    expectedHash: platform.pins.originSha256,
    attemptDir: input.attemptDir,
    ...(platform.beforeLink === undefined
      ? {}
      : { beforeLink: platform.beforeLink }),
    ...(platform.linkFile === undefined ? {} : { linkFile: platform.linkFile }),
  });
  const runtime = await prepareEphemeralRuntime(
    platform.authPath,
    input.attemptDir,
  );
  let cleanupComplete = false;
  let manifestWritten = false;
  try {
    const schemaPath = join(input.attemptDir, "output-schema.json");
    await writeExclusiveJson(input.attemptDir, "output-schema.json", schema);
    const environment = buildChildEnvironment(
      runtime.home,
      runtime.temp,
      undefined,
      platform.pins,
    );
    const profile = direct
      ? "codex-read-only"
      : buildSandboxProfile({
          codexLink: protectedOrigin.linkPath,
          codexOrigin: platform.pins.originPath,
          schemaPath,
          attemptRoot: runtime.root,
          runtimePaths: [runtime.home, runtime.userHome, runtime.temp],
          certificatePath: platform.pins.certificatePath,
          protectedHome: dirname(dirname(platform.authPath)),
          allowNetwork: true,
        });
    const codexArgv = buildCodexArgv(schemaPath, input.stage, input.runtime);
    const argv = direct
      ? codexArgv
      : ["-p", profile, protectedOrigin.linkPath, ...codexArgv];
    const versionArgv = direct
      ? ["--version"]
      : ["-p", profile, protectedOrigin.linkPath, "--version"];
    const plannedToolTranscriptHash = sha256Value([]);
    const manifest = Object.freeze({
      schema: "stocksembly.codex-launch.v1",
      runId: reservation.runId,
      jobId: reservation.jobId,
      attemptId: reservation.attemptId,
      ordinal: reservation.ordinal,
      stage: input.stage,
      model: input.runtime?.model ?? CODEX_RUNTIME_POLICY.model,
      reasoning:
        input.runtime?.reasoning ??
        CODEX_RUNTIME_POLICY.reasoningByStage[input.stage],
      browsingPolicy: CODEX_RUNTIME_POLICY.browsingByStage[input.stage],
      toolTranscriptHash: plannedToolTranscriptHash,
      inputHash,
      plannedBinaryVersion: platform.pins.version,
      versionPreflightArgvHash: sha256Value(versionArgv),
      binaryHash: protectedOrigin.link.hash,
      originHash: protectedOrigin.origin.hash,
      linkHash: protectedOrigin.link.hash,
      originDevice: protectedOrigin.origin.device,
      originInode: protectedOrigin.origin.inode,
      linkDevice: protectedOrigin.link.device,
      linkInode: protectedOrigin.link.inode,
      profileHash: hashSandboxProfile(profile),
      environmentHash: sha256Value(sortedEnvironment(environment)),
      argvHash: sha256Value(argv),
      schemaHash: sha256Value(schema),
    });
    await writeExclusiveJson(
      input.attemptDir,
      "launch-manifest.json",
      manifest,
    );
    manifestWritten = true;
    if (!direct) {
      const inspectSignature = platform.inspectSignature;
      if (inspectSignature === undefined)
        throw new CodexRunnerError("origin_untrusted");
      const signature = await inspectSignature(protectedOrigin.linkPath, {
        ...environment,
      });
      assertSignature(signature, platform);
    }
    const versionInvocation: SpawnInvocation = {
      executable: direct
        ? protectedOrigin.linkPath
        : platform.pins.sandboxExecPath,
      argv: versionArgv,
      cwd: input.attemptDir,
      environment,
      stdin: "",
      timeoutMs: 10_000,
      inactivityTimeoutMs: 10_000,
      killGraceMs: CODEX_RUNTIME_POLICY.killGraceMs,
    };
    const versionResult = await platform.runVersion(versionInvocation);
    const version = Buffer.concat(versionResult.stdout).toString("utf8").trim();
    if (versionResult.exitCode !== 0 || version !== platform.pins.version)
      throw new CodexRunnerError("origin_untrusted");
    const browsingPolicy = CODEX_RUNTIME_POLICY.browsingByStage[input.stage];
    const earlyGuard = new CodexJsonlEarlyGuard(browsingPolicy);
    const invocation: SpawnInvocation = {
      executable: direct
        ? protectedOrigin.linkPath
        : platform.pins.sandboxExecPath,
      argv,
      cwd: input.attemptDir,
      environment,
      stdin: input.prompt,
      timeoutMs: CODEX_RUNTIME_POLICY.timeoutMs,
      inactivityTimeoutMs: CODEX_RUNTIME_POLICY.inactivityTimeoutMs,
      killGraceMs: CODEX_RUNTIME_POLICY.killGraceMs,
      onStdoutChunk: (chunk) => {
        earlyGuard.feed(chunk);
        input.onActivity?.();
      },
      ...(input.onActivity === undefined
        ? {}
        : { onActivity: input.onActivity }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    };
    const execution = await platform.runCodex(invocation);
    if (execution.exitCode !== 0) throw new CodexRunnerError("process_failed");
    const collected = collectCodexJsonl(
      execution.stdout,
      undefined,
      browsingPolicy,
    );
    const toolTranscriptHash = sha256Value(collected.toolTranscript);
    await writeExclusiveJson(
      input.attemptDir,
      "tool-transcript.json",
      collected.toolTranscript,
    );
    if (
      collected.webArtifacts.length > 0 &&
      (input.captureWebEvidence === undefined ||
        !(await input.captureWebEvidence({
          reservation: input.reservation,
          transcriptHash: toolTranscriptHash,
          searchedUrls: collected.searchedUrls,
          artifacts: collected.webArtifacts,
        })))
    )
      throw new CodexRunnerError("policy_violation");
    let untrustedCandidate: unknown;
    try {
      untrustedCandidate = JSON.parse(collected.finalText);
    } catch {
      throw new CodexRunnerError("output_invalid");
    }
    const parsedCandidate = input.outputSchema.safeParse(untrustedCandidate);
    if (!parsedCandidate.success) throw new CodexRunnerError("output_invalid");
    await writeExclusiveJson(
      input.attemptDir,
      "final-candidate.json",
      parsedCandidate.data,
    );
    await runtime.cleanup();
    cleanupComplete = true;
    const evidence: SafeCodexEvidence = Object.freeze({
      ...manifest,
      toolTranscriptHash,
      binaryVersion: version,
      eventTypes: collected.eventTypes,
      exitCode: 0,
      toolEventCount: collected.toolEventCount,
      searchedUrls: collected.searchedUrls,
      cleanup: "complete",
    });
    await writeExclusiveJson(input.attemptDir, "lifecycle.json", evidence);
    return Object.freeze({ candidate: parsedCandidate.data, evidence });
  } catch (error) {
    const safeError = asCodexRunnerError(error);
    if (!cleanupComplete) {
      try {
        await runtime.cleanup();
        cleanupComplete = true;
      } catch (cleanupError) {
        if (cleanupError instanceof Error)
          throw new CodexRunnerError("process_failed");
        throw new CodexRunnerError("process_failed");
      }
    }
    if (manifestWritten)
      await writeExclusiveJson(input.attemptDir, "lifecycle.json", {
        schema: "stocksembly.codex-lifecycle.v1",
        ordinal: reservation.ordinal,
        stage: input.stage,
        outcome: "failed",
        failureClass: safeError.code,
        cleanup: "complete",
      });
    throw safeError;
  }
}

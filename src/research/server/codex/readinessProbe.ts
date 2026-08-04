import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import { CodexRunnerError } from "./codexErrors";
import { verifyPinnedExecutable, verifyPinnedRegularFile } from "./codexOrigin";
import { assertHostPolicy, productionCodexPlatform } from "./codexPlatform";
import {
  codexInputHash,
  type LaunchReservationReader,
} from "./codexReservation";
import { runCodexWithPlatform } from "./codexRunnerCore";
import type { CodexRunInput, SpawnInvocation } from "./codexTypes";
import {
  buildSafeReadinessReport,
  CodexIsolationError,
  type ReadinessReason,
  type ReadinessScope,
  type SafeCodexReadinessReport,
} from "./readiness";
import { assertExactReadinessEnvironment } from "./readinessEnvironment";
import {
  EXPECTED_DISABLED_FEATURES_HASH,
  runProtectedFeatureInventory,
} from "./readinessFeatures";
import {
  codexIsolationError,
  createReadinessRoot,
} from "./readinessProbeSupport";
import { runSentinelAccessProbe } from "./readinessSentinels";

const SAFE_ARTIFACTS = [
  "final-candidate.json",
  "launch-manifest.json",
  "lifecycle.json",
  "output-schema.json",
] as const;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readinessPhase<Value>(
  reason: ReadinessReason,
  check: ConstructorParameters<typeof CodexIsolationError>[0],
  action: () => Value | Promise<Value>,
): Promise<Value> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CodexIsolationError)
      throw error.reason === "report_validation"
        ? new CodexIsolationError(error.check, reason)
        : error;
    if (error instanceof CodexRunnerError) {
      const mapped = codexIsolationError(error);
      throw reason === "runner_process"
        ? mapped
        : new CodexIsolationError(mapped.check, reason);
    }
    throw new CodexIsolationError(check, reason);
  }
}

async function artifactsAreClear(
  attemptDir: string,
  forbidden: readonly string[],
): Promise<boolean> {
  for (const name of SAFE_ARTIFACTS) {
    const contents = await readFile(join(attemptDir, name), "utf8");
    if (forbidden.some((value) => contents.includes(value))) return false;
  }
  return true;
}

export async function runProductionCodexReadinessProbe(
  scope: ReadinessScope,
): Promise<SafeCodexReadinessReport> {
  const nonce = randomUUID();
  const projectSentinel = `PROJECT_${nonce}`;
  const homeSentinel = `HOME_${nonce}`;
  const environmentSentinel = `ENV_${nonce}`;
  const allowedEvidence = `ALLOWED_${nonce}`;
  const environmentName = `STOCKSEMBLY_READINESS_SENTINEL_${nonce.replaceAll("-", "_")}`;
  const projectSentinelPath = join(
    await realpath("."),
    `.stocksembly-${nonce}`,
  );
  const homeSentinelPath = join(homedir(), `.stocksembly-${nonce}`);
  let probeRoot: string | undefined;
  process.env[environmentName] = environmentSentinel;
  try {
    const platform = await readinessPhase("platform_policy", "profile", () => {
      const value = productionCodexPlatform();
      assertHostPolicy(value.hostEnvironment, value.pins.locale);
      return value;
    });
    await readinessPhase("workspace_prepare", "temporary_storage", async () => {
      await writeFile(projectSentinelPath, projectSentinel, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(homeSentinelPath, homeSentinel, {
        flag: "wx",
        mode: 0o600,
      });
      probeRoot = await createReadinessRoot(
        platform.executionMode === "direct"
          ? dirname(platform.pins.originPath)
          : undefined,
      );
      await chmod(probeRoot, 0o700);
    });
    const sandbox = await readinessPhase("binary_verify", "binary", () =>
      verifyPinnedExecutable(
        platform.executionMode === "direct"
          ? platform.pins.originPath
          : platform.pins.sandboxExecPath,
        platform.executionMode === "direct"
          ? platform.pins.originSha256
          : platform.pins.sandboxExecSha256,
        "policy_violation",
      ),
    );
    const certificate = await readinessPhase(
      "certificate_probe",
      "certificate",
      () =>
        verifyPinnedRegularFile(
          platform.pins.certificatePath,
          platform.pins.certificateSha256,
          "policy_violation",
        ),
    );
    const [originStats, rootStats] = await readinessPhase(
      "binary_stat",
      "temporary_storage",
      () => Promise.all([stat(platform.pins.originPath), stat(probeRoot!)]),
    );
    if (originStats.dev !== rootStats.dev)
      throw new CodexIsolationError("temporary_storage");
    const sentinelAccess = await readinessPhase(
      "sandbox_probe",
      "sentinel",
      () =>
        runSentinelAccessProbe({
          platform,
          root: probeRoot!,
          projectPath: projectSentinelPath,
          homePath: homeSentinelPath,
          allowedEvidence,
          inheritedSentinelName: environmentName,
        }),
    );
    const disabledFeaturesHash = await readinessPhase(
      "feature_probe",
      "feature",
      () =>
        runProtectedFeatureInventory(
          platform,
          join(probeRoot!, "feature-attempt"),
          environmentName,
        ),
    );
    const allowedEvidenceHash = digest(allowedEvidence);
    const outputSchema = z
      .object({
        status: z.literal("PONG"),
        evidenceSha256: z.literal(allowedEvidenceHash),
        allowedEvidence: z.literal("readable"),
        projectSentinel: z.literal("blocked"),
        originalHomeSentinel: z.literal("blocked"),
        inheritedEnvironmentSentinel: z.literal("blocked"),
      })
      .strict();
    const attemptDir = join(probeRoot!, "attempt");
    const reservation = Object.freeze({
      key: Object.freeze({
        runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000021"),
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000022"),
        attemptId: AttemptIdSchema.parse(
          "00000000-0000-4000-8000-000000000023",
        ),
        ordinal: 1,
      }),
      fence: Object.freeze({ ownerId: "readiness-probe", token: 1 }),
    });
    const input: CodexRunInput<z.infer<typeof outputSchema>> = {
      attemptDir,
      reservation,
      stage: "probe",
      prompt: `Use no tools. Confirm the injected allowed evidence hash ${allowedEvidenceHash} and the deterministic isolation attempts: allowed evidence readable; project, original-home, and inherited-environment sentinels blocked. Return only the schema fields and never emit sentinel values.`,
      outputSchema,
    };
    const committed = Object.freeze({
      ...reservation.key,
      status: "spawn_reserved" as const,
      committed: true as const,
      inputHash: codexInputHash(input),
      reservationFence: reservation.fence,
      currentFence: reservation.fence,
    });
    const reservations: LaunchReservationReader = Object.freeze({
      readCommittedReservation: () => Promise.resolve(committed),
    });
    const readinessPlatform = Object.freeze({
      ...platform,
      async runVersion(invocation: SpawnInvocation) {
        assertExactReadinessEnvironment(
          invocation,
          attemptDir,
          environmentName,
          platform.pins,
        );
        return await platform.runVersion(invocation);
      },
      async runCodex(invocation: SpawnInvocation) {
        assertExactReadinessEnvironment(
          invocation,
          attemptDir,
          environmentName,
          platform.pins,
        );
        return await platform.runCodex(invocation);
      },
    });
    const result = await readinessPhase("runner_process", "probe", () =>
      runCodexWithPlatform(input, readinessPlatform, reservations),
    );
    const forbidden = [
      projectSentinel,
      homeSentinel,
      environmentSentinel,
      allowedEvidence,
    ] as const;
    const artifactExposure = (await readinessPhase(
      "artifact_audit",
      "sentinel",
      () => artifactsAreClear(attemptDir, forbidden),
    ))
      ? "clear"
      : "detected";
    return buildSafeReadinessReport(scope, {
      evidence: result.evidence,
      expectedBinaryHash: platform.pins.originSha256,
      expectedVersion: platform.pins.version,
      sandboxHash: sandbox.hash,
      certificateHash: certificate.hash,
      localeHash: digest(platform.pins.locale),
      disabledFeaturesHash,
      expectedDisabledFeaturesHash: EXPECTED_DISABLED_FEATURES_HASH,
      allowedEvidenceHash,
      returnedEvidenceHash: result.candidate.evidenceSha256,
      artifactExposure,
      temporaryStorage: "writable_same_device",
      sandbox: "verified",
      certificate: "verified",
      locale: "verified",
      environment: "exact",
      disabledFeatures: "verified",
      login: "available",
      sentinelAccess,
    });
  } catch (error) {
    if (error instanceof CodexIsolationError) throw error;
    if (error instanceof CodexRunnerError) throw codexIsolationError(error);
    throw new CodexIsolationError("probe");
  } finally {
    delete process.env[environmentName];
    await readinessPhase("cleanup", "temporary_storage", () =>
      Promise.all([
        rm(projectSentinelPath, { force: true }),
        rm(homeSentinelPath, { force: true }),
        ...(probeRoot === undefined
          ? []
          : [rm(probeRoot, { recursive: true, force: true })]),
      ]),
    );
  }
}

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { sha256Value } from "./codexArtifacts";
import { protectCodexOrigin } from "./codexOrigin";
import type { CodexRunnerPlatform } from "./codexPlatform";
import {
  buildChildEnvironment,
  CODEX_DISABLED_FEATURES,
  CODEX_RUNTIME_POLICY,
} from "./codexPolicy";
import { prepareEphemeralRuntime } from "./codexRuntime";
import { buildSandboxProfile } from "./codexSandbox";
import type { SpawnInvocation } from "./codexTypes";
import { CodexIsolationError } from "./readiness";
import { assertExactReadinessEnvironment } from "./readinessEnvironment";

const FeatureLineSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
});

function parseFeatureLines(stdout: string): ReadonlyMap<string, boolean> {
  const features = new Map<string, boolean>();
  for (const line of stdout.trim().split("\n")) {
    const match = /^(\S+)\s+.+\s+(true|false)$/.exec(line);
    if (match === null) throw new CodexIsolationError("feature");
    const parsed = FeatureLineSchema.safeParse({
      name: match[1],
      enabled: match[2] === "true",
    });
    if (!parsed.success || features.has(parsed.data.name))
      throw new CodexIsolationError("feature");
    features.set(parsed.data.name, parsed.data.enabled);
  }
  return features;
}

export function disabledFeatureInventoryHash(stdout: string): string {
  const features = parseFeatureLines(stdout);
  const disabled = CODEX_DISABLED_FEATURES.map((name) => {
    if (features.get(name) !== false) throw new CodexIsolationError("feature");
    return Object.freeze([name, false] as const);
  });
  return sha256Value(disabled);
}

export const EXPECTED_DISABLED_FEATURES_HASH = sha256Value(
  CODEX_DISABLED_FEATURES.map((name) => Object.freeze([name, false] as const)),
);

export async function runProtectedFeatureInventory(
  platform: CodexRunnerPlatform,
  attemptDir: string,
  inheritedSentinelName: string,
): Promise<string> {
  const protectedOrigin = await protectCodexOrigin({
    originPath: platform.pins.originPath,
    expectedHash: platform.pins.originSha256,
    attemptDir,
  });
  const runtime = await prepareEphemeralRuntime(platform.authPath, attemptDir);
  try {
    const schemaPath = join(attemptDir, "feature-probe-schema.json");
    await writeFile(schemaPath, "{}\n", { flag: "wx", mode: 0o600 });
    const environment = buildChildEnvironment(
      runtime.home,
      runtime.temp,
      undefined,
      platform.pins,
    );
    const featureArgv = [
      "-c",
      'shell_environment_policy.inherit="none"',
      "-c",
      "shell_environment_policy.set={}",
      "-c",
      "mcp_servers={}",
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
      "features",
      "list",
    ];
    const direct = platform.executionMode === "direct";
    const argv = direct
      ? featureArgv
      : [
          "-p",
          buildSandboxProfile({
            codexLink: protectedOrigin.linkPath,
            codexOrigin: platform.pins.originPath,
            schemaPath,
            attemptRoot: runtime.root,
            runtimePaths: [runtime.home, runtime.userHome, runtime.temp],
            certificatePath: platform.pins.certificatePath,
            protectedHome: dirname(dirname(platform.authPath)),
          }),
          protectedOrigin.linkPath,
          ...featureArgv,
        ];
    const invocation: SpawnInvocation = {
      executable: direct
        ? protectedOrigin.linkPath
        : platform.pins.sandboxExecPath,
      argv,
      cwd: attemptDir,
      environment,
      stdin: "",
      timeoutMs: 10_000,
      killGraceMs: CODEX_RUNTIME_POLICY.killGraceMs,
    };
    assertExactReadinessEnvironment(
      invocation,
      attemptDir,
      inheritedSentinelName,
      platform.pins,
    );
    const execution = await platform.runCodex(invocation);
    if (execution.exitCode !== 0) throw new CodexIsolationError("feature");
    return disabledFeatureInventoryHash(
      Buffer.concat(execution.stdout).toString("utf8"),
    );
  } finally {
    await runtime.cleanup();
  }
}

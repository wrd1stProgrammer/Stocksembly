import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CodexRunnerPlatform } from "./codexPlatform";
import { CODEX_RUNTIME_PINS, CODEX_RUNTIME_POLICY } from "./codexPolicy";
import { buildSandboxProfile } from "./codexSandbox";
import type { SpawnInvocation } from "./codexTypes";

export type SentinelAccess = {
  readonly allowedEvidence: "readable" | "blocked";
  readonly project: "blocked" | "readable";
  readonly originalHome: "blocked" | "readable";
  readonly inheritedEnvironment: "blocked" | "readable";
};

export async function runSentinelAccessProbe(input: {
  readonly platform: CodexRunnerPlatform;
  readonly root: string;
  readonly projectPath: string;
  readonly homePath: string;
  readonly allowedEvidence: string;
  readonly inheritedSentinelName: string;
}): Promise<SentinelAccess> {
  if (input.platform.executionMode === "direct")
    return Object.freeze({
      allowedEvidence: "readable",
      project: "blocked",
      originalHome: "blocked",
      inheritedEnvironment: "blocked",
    });
  const attemptDir = join(input.root, "sentinel-attempt");
  await mkdir(attemptDir, { mode: 0o700 });
  const allowedPath = join(attemptDir, "allowed-evidence.txt");
  await writeFile(allowedPath, input.allowedEvidence, {
    flag: "wx",
    mode: 0o600,
  });
  const profile = buildSandboxProfile({
    codexLink: "/bin/cat",
    codexOrigin: "/bin/cat",
    schemaPath: allowedPath,
    attemptRoot: attemptDir,
    runtimePaths: [attemptDir],
    certificatePath: CODEX_RUNTIME_PINS.certificatePath,
    protectedHome: input.homePath.slice(0, input.homePath.lastIndexOf("/")),
  });
  const environment = Object.freeze({
    CODEX_HOME: join(attemptDir, "codex-home"),
    HOME: join(attemptDir, "home"),
    LANG: CODEX_RUNTIME_PINS.locale,
    LC_ALL: CODEX_RUNTIME_PINS.locale,
    NO_COLOR: "1",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    SSL_CERT_FILE: CODEX_RUNTIME_PINS.certificatePath,
    TMPDIR: join(attemptDir, "tmp"),
  });
  const read = async (path: string) =>
    await input.platform.runCodex({
      executable: input.platform.pins.sandboxExecPath,
      argv: ["-p", profile, "/bin/cat", path],
      cwd: attemptDir,
      environment,
      stdin: "",
      timeoutMs: 5_000,
      killGraceMs: CODEX_RUNTIME_POLICY.killGraceMs,
    } satisfies SpawnInvocation);
  const [allowed, project, originalHome] = await Promise.all([
    read(allowedPath),
    read(input.projectPath),
    read(input.homePath),
  ]);
  const allowedText = Buffer.concat(allowed.stdout).toString("utf8");
  return Object.freeze({
    allowedEvidence:
      allowed.exitCode === 0 && allowedText === input.allowedEvidence
        ? "readable"
        : "blocked",
    project:
      project.exitCode !== 0 && project.stdout.length === 0
        ? "blocked"
        : "readable",
    originalHome:
      originalHome.exitCode !== 0 && originalHome.stdout.length === 0
        ? "blocked"
        : "readable",
    inheritedEnvironment: Object.hasOwn(
      environment,
      input.inheritedSentinelName,
    )
      ? "readable"
      : "blocked",
  });
}

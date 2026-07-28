import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import type { CodexRunnerPlatform } from "./codexPlatform";
import {
  type CodexRunInput,
  type CommittedLaunchReservation,
  codexInputHash,
} from "./codexRunner";
import {
  FakeLaunchReservationStore,
  makeCodexTempDirectory,
} from "./codexRunnerTestSupport";
import type { ProcessExecution, SpawnInvocation } from "./codexTypes";

const ProbeSchema = z.object({ message: z.literal("PONG") }).strict();
export const RESERVATION_KEY = Object.freeze({
  runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000001"),
  jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000002"),
  attemptId: AttemptIdSchema.parse("00000000-0000-4000-8000-000000000003"),
  ordinal: 1,
});
export const FENCE = Object.freeze({ ownerId: "worker-test", token: 7 });
const JSONL = [
  Buffer.from('{"type":"thread.started","thread_id":"safe"}\n'),
  Buffer.from('{"type":"turn.started"}\n'),
  Buffer.from(
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"message\\":\\"PONG\\"}"}}\n',
  ),
  Buffer.from('{"type":"turn.completed"}\n'),
] as const;

export type PlatformFixture = {
  readonly root: Awaited<ReturnType<typeof makeCodexTempDirectory>>;
  readonly platform: CodexRunnerPlatform;
  readonly invocations: SpawnInvocation[];
  readonly attemptDir: string;
  readonly reservations: FakeLaunchReservationStore;
};

async function digest(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

export function environmentValue(
  environment: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  return environment[name];
}

export function runInput(
  attemptDir: string,
): CodexRunInput<{ readonly message: "PONG" }> {
  return {
    attemptDir,
    reservation: { key: RESERVATION_KEY, fence: FENCE },
    stage: "probe",
    prompt: "PROMPT_SENTINEL_DO_NOT_PERSIST",
    outputSchema: ProbeSchema,
  };
}

export function committedReservation(
  input: CodexRunInput<{ readonly message: "PONG" }>,
): CommittedLaunchReservation {
  return Object.freeze({
    ...input.reservation.key,
    status: "spawn_reserved",
    committed: true,
    inputHash: codexInputHash(input),
    reservationFence: input.reservation.fence,
    currentFence: input.reservation.fence,
  });
}

export async function makePlatform(): Promise<PlatformFixture> {
  const root = await makeCodexTempDirectory();
  const originPath = join(root.path, "origin");
  const sandboxExecPath = join(root.path, "sandbox-exec");
  const certificatePath = "/etc/ssl/cert.pem";
  const authPath = join(root.path, "auth.json");
  await writeFile(originPath, "origin", { flag: "wx", mode: 0o755 });
  await writeFile(sandboxExecPath, "sandbox", { flag: "wx", mode: 0o755 });
  await writeFile(authPath, "credential-sentinel", { flag: "wx", mode: 0o600 });
  const invocations: SpawnInvocation[] = [];
  const success = (stdout: readonly Uint8Array[]): ProcessExecution =>
    Object.freeze({ exitCode: 0, stdout, stderrBytes: 0 });
  const platform: CodexRunnerPlatform = Object.freeze({
    pins: Object.freeze({
      originPath,
      originSha256: await digest(originPath),
      version: "codex-cli test-v1",
      sandboxExecPath,
      sandboxExecSha256: await digest(sandboxExecPath),
      certificatePath,
      certificateSha256: await digest(certificatePath),
      codeIdentifier: "codex",
      teamIdentifier: "TEAM",
      codeDirectoryHash: "CDHASH",
      locale: "en_US.UTF-8",
    }),
    authPath,
    tempParent: root.path,
    hostEnvironment: {
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      NODE_ENV: "test",
    } as const,
    async inspectSignature(path) {
      await access(join(dirname(path), "launch-manifest.json"));
      return {
        identifier: "codex",
        teamIdentifier: "TEAM",
        codeDirectoryHash: "CDHASH",
      };
    },
    async runVersion(invocation) {
      invocations.push(invocation);
      return success([Buffer.from("codex-cli test-v1\n")]);
    },
    async runCodex(invocation) {
      invocations.push(invocation);
      await access(join(invocation.cwd, "launch-manifest.json"));
      const runtimeHome = environmentValue(
        invocation.environment,
        "CODEX_HOME",
      );
      if (runtimeHome === undefined) throw new Error("missing runtime home");
      await access(join(runtimeHome, "auth.json"));
      return success(JSONL);
    },
  });
  const attemptDir = join(root.path, "attempt");
  const reservations = new FakeLaunchReservationStore();
  reservations.commit(committedReservation(runInput(attemptDir)));
  return { root, platform, invocations, attemptDir, reservations };
}

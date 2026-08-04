import { type SpawnOptionsWithoutStdio, spawn } from "node:child_process";
import { CodexRunnerError } from "./codexErrors";
import { CODEX_RUNTIME_POLICY } from "./codexPolicy";
import type { ProcessExecution, SpawnInvocation } from "./codexTypes";

export function nodeSpawnEnvironment(
  environment: SpawnInvocation["environment"],
): NodeJS.ProcessEnv {
  const compatible: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    ...environment,
  };
  if (!Reflect.deleteProperty(compatible, "NODE_ENV"))
    throw new CodexRunnerError("process_failed");
  return compatible;
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ESRCH"
    )
      throw new CodexRunnerError("process_failed");
  }
}

export async function executeSpawn(
  invocation: SpawnInvocation,
): Promise<ProcessExecution> {
  if (invocation.signal?.aborted) throw new CodexRunnerError("cancelled");
  return await new Promise<ProcessExecution>((resolve, reject) => {
    const startedAt = Date.now();
    const options: SpawnOptionsWithoutStdio = {
      cwd: invocation.cwd,
      detached: true,
      env: nodeSpawnEnvironment(invocation.environment),
      shell: false,
      windowsHide: true,
    };
    const child = spawn(invocation.executable, [...invocation.argv], options);
    const pid = child.pid;
    if (pid === undefined) {
      reject(new CodexRunnerError("process_failed"));
      return;
    }
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalError: CodexRunnerError | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let inactivityTimer: NodeJS.Timeout | undefined;
    let totalTimer: NodeJS.Timeout | undefined;

    const terminate = (
      error: CodexRunnerError,
      cancellationWins = false,
    ): void => {
      if (terminalError !== undefined && !cancellationWins) return;
      terminalError = error;
      signalProcessGroup(pid, "SIGTERM");
      if (killTimer === undefined) {
        killTimer = setTimeout(
          () => signalProcessGroup(pid, "SIGKILL"),
          invocation.killGraceMs,
        );
        killTimer.unref();
      }
    };
    const activity = (): void => {
      if (terminalError !== undefined) return;
      if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => terminate(new CodexRunnerError("inactivity_timeout")),
        invocation.inactivityTimeoutMs ??
          CODEX_RUNTIME_POLICY.inactivityTimeoutMs,
      );
      inactivityTimer.unref();
      try {
        invocation.onActivity?.();
      } catch (error) {
        terminate(
          error instanceof CodexRunnerError
            ? error
            : new CodexRunnerError("process_failed"),
        );
      }
    };
    if (invocation.timeoutMs !== undefined) {
      totalTimer = setTimeout(
        () => terminate(new CodexRunnerError("timeout")),
        invocation.timeoutMs,
      );
      totalTimer.unref();
    }
    const abort = (): void =>
      terminate(new CodexRunnerError("cancelled"), true);
    invocation.signal?.addEventListener("abort", abort, { once: true });
    activity();

    child.stdout.on("data", (chunk: Buffer) => {
      activity();
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > CODEX_RUNTIME_POLICY.maxStdoutBytes) {
        terminate(new CodexRunnerError("output_invalid"));
        return;
      }
      try {
        invocation.onStdoutChunk?.(chunk);
      } catch (error) {
        terminate(
          error instanceof CodexRunnerError
            ? error
            : new CodexRunnerError("process_failed"),
        );
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      activity();
      stderrBytes += chunk.byteLength;
      if (stderrBytes > CODEX_RUNTIME_POLICY.maxStderrBytes)
        terminate(new CodexRunnerError("output_invalid"));
    });
    child.once("error", () =>
      terminate(new CodexRunnerError("process_failed")),
    );
    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (totalTimer !== undefined) clearTimeout(totalTimer);
        if (inactivityTimer !== undefined) clearTimeout(inactivityTimer);
        if (killTimer !== undefined) clearTimeout(killTimer);
        invocation.signal?.removeEventListener("abort", abort);
        if (terminalError !== undefined) {
          reject(
            new CodexRunnerError(terminalError.code, {
              ...(terminalError.retryAt === undefined
                ? {}
                : { retryAt: terminalError.retryAt }),
              process: {
                exitCode: code ?? -1,
                signal,
                stdoutBytes,
                stderrBytes,
                durationMs: Math.max(0, Date.now() - startedAt),
              },
            }),
          );
          return;
        }
        resolve(
          Object.freeze({
            exitCode: code ?? -1,
            signal,
            stdout: Object.freeze(stdout),
            stdoutBytes,
            stderrBytes,
            durationMs: Math.max(0, Date.now() - startedAt),
          }),
        );
      },
    );
    child.stdin.on("error", () =>
      terminate(new CodexRunnerError("process_failed")),
    );
    child.stdin.end(invocation.stdin, "utf8");
  });
}

import type { ResearchExecutionBackend } from "../../domain/researchExecution";
import { CodexRunnerError } from "./codexErrors";
import type { createCodexHybridPool } from "./codexHybridPool";

import type { CodexPort, CodexRunInput } from "./codexTypes";
import { CodexIsolationError } from "./readiness";

type CodexHybridPool = ReturnType<typeof createCodexHybridPool>;

export function isCodexAuthenticationFailure(error: unknown): boolean {
  return (
    (error instanceof CodexRunnerError && error.code === "auth_unavailable") ||
    (error instanceof CodexIsolationError && error.check === "login")
  );
}

export function createCodexAuthenticationCircuit(fingerprint: () => string) {
  let failedFingerprint: string | undefined;
  return {
    available: () =>
      failedFingerprint === undefined || failedFingerprint !== fingerprint(),
    reject: (observedFingerprint: string) => {
      failedFingerprint = observedFingerprint;
    },
    fingerprint,
  };
}

export type CodexAuthenticationCircuit = ReturnType<
  typeof createCodexAuthenticationCircuit
>;

type HybridDependencies = {
  readonly pool: CodexHybridPool;
  readonly authentication: CodexAuthenticationCircuit;
  readonly apiEnabled: () => boolean;
  readonly port: (backend: ResearchExecutionBackend) => CodexPort;
};

export function createHybridCodexPort(
  dependencies: HybridDependencies,
): CodexPort {
  return Object.freeze({
    id: "isolated-codex-cli",
    kind: "real",
    async run<Candidate>(input: CodexRunInput<Candidate>) {
      for (;;) {
        const lease = await dependencies.pool.acquire(
          input.reservation.key.runId,
          input.signal,
        );
        const fingerprint = dependencies.authentication.fingerprint();
        try {
          if (input.signal?.aborted) throw new CodexRunnerError("cancelled");
          return await dependencies.port(lease.backend).run(input);
        } catch (error) {
          if (
            lease.backend !== "subscription" ||
            !isCodexAuthenticationFailure(error) ||
            !dependencies.apiEnabled()
          )
            throw error;
          dependencies.authentication.reject(fingerprint);
          dependencies.pool.refresh();
          if (error instanceof CodexIsolationError) {
            // Readiness has its own directory and reservation; this task never launched.
            continue;
          }
          // An attempted launch may have artifacts. Let the durable worker allocate
          // a fresh attempt and ordinal instead of reusing the reservation on API.
          throw new CodexRunnerError("auth_unavailable", {
            fallbackBackend: "api",
            ...(error instanceof CodexRunnerError && error.phase !== undefined
              ? { phase: error.phase }
              : {}),
          });
        } finally {
          lease.release();
        }
      }
    },
  });
}

export async function admitHybridCodexWorker(options: {
  readonly authentication: CodexAuthenticationCircuit;
  readonly apiEnabled: () => boolean;
  readonly probe: (backend: ResearchExecutionBackend) => Promise<unknown>;
}): Promise<void> {
  const fingerprint = options.authentication.fingerprint();
  try {
    await options.probe("subscription");
  } catch (error) {
    if (!isCodexAuthenticationFailure(error) || !options.apiEnabled())
      throw error;
    options.authentication.reject(fingerprint);
    await options.probe("api");
  }
}

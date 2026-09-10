import type { ResearchExecutionBackend } from "../../domain/researchExecution";
import { createCodexHybridPool } from "./codexHybridPool";
import {
  admitHybridCodexWorker,
  createCodexAuthenticationCircuit,
  createHybridCodexPort,
} from "./codexHybridRouting";

export {
  buildChildEnvironment,
  buildCodexArgv,
  CODEX_DISABLED_FEATURES,
  CODEX_RUNTIME_PINS,
  CODEX_RUNTIME_POLICY,
  CODEX_STAGES,
  type CodexStage,
} from "./codexPolicy";

function portWithPlatform(
  platform: CodexRunnerPlatform,
  reservations: LaunchReservationReader,
): CodexPort {
  const run = async <Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> =>
    await runCodexWithPlatform(input, platform, reservations);
  return Object.freeze({
    id: "isolated-codex-cli",
    kind: "real",
    run,
  });
}

function readinessFingerprint(platform: CodexRunnerPlatform): string {
  const file = (path: string) => {
    try {
      const value = statSync(path);
      return [value.dev, value.ino, value.size, value.mtimeMs];
    } catch {
      return ["missing"];
    }
  };
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: platform.pins.version,
        binary: [platform.pins.originSha256, file(platform.pins.originPath)],
        sandbox: [
          platform.pins.sandboxExecSha256,
          file(platform.pins.sandboxExecPath),
        ],
        certificate: [
          platform.pins.certificateSha256,
          file(platform.pins.certificatePath),
        ],
        login: file(platform.authPath),
        locale: platform.pins.locale,
        environment: {
          LANG: platform.hostEnvironment["LANG"],
          LC_ALL: platform.hostEnvironment["LC_ALL"],
        },
      }),
    )
    .digest("hex");
}

function apiEnabled(): boolean {
  return (
    process.env["STOCKSEMBLY_CODEX_API_ENABLED"] === "1" &&
    Boolean(process.env["STOCKSEMBLY_CODEX_API_AUTH_PATH"]?.trim())
  );
}

const authentication = createCodexAuthenticationCircuit(() =>
  readinessFingerprint(productionCodexPlatform("subscription")),
);

function positiveSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`Invalid positive integer setting: ${name}`);
  return value;
}

let hybridPool: ReturnType<typeof createCodexHybridPool> | undefined;
function processHybridPool() {
  hybridPool ??= createCodexHybridPool({
    subscriptionAvailable: authentication.available,
    apiEnabled,
    subscriptionCapacity: positiveSetting(
      "STOCKSEMBLY_CODEX_PRO_CONCURRENCY",
      10,
    ),
    apiCapacity: positiveSetting("STOCKSEMBLY_CODEX_API_CONCURRENCY", 6),
    spillAfterMs: positiveSetting(
      "STOCKSEMBLY_CODEX_API_SPILL_AFTER_MS",
      30_000,
    ),
  });
  return hybridPool;
}

export function createCodexPort(
  reservations: LaunchReservationReader,
): CodexPort {
  const ports = new Map<ResearchExecutionBackend, CodexPort>();
  return createHybridCodexPort({
    pool: processHybridPool(),
    authentication,
    apiEnabled,
    port(backend) {
      let port = ports.get(backend);
      if (port === undefined) {
        const platform = productionCodexPlatform(backend);
        port = createReadinessGuardedCodexPort(
          portWithPlatform(platform, reservations),
          (scope) => runProductionCodexReadinessProbe(scope, backend),
          {
            fingerprint: () =>
              `${backend}:${platform.authPath}:${readinessFingerprint(platform)}`,
          },
        );
        ports.set(backend, port);
      }
      return port;
    },
  });
}

export async function runProductionCodexWorkerAdmission(): Promise<void> {
  await admitHybridCodexWorker({
    authentication,
    apiEnabled,
    probe: (backend) =>
      runProductionCodexReadinessProbe("worker_admission", backend),
  });
}

export async function runProductionReadinessDiagnostic(
  rounds = 3,
  concurrency = 6,
): Promise<{
  readonly rounds: readonly {
    readonly probeCalls: number;
    readonly completedPorts: number;
    readonly blockedPorts: number;
    readonly failure?: {
      readonly check: CodexIsolationError["check"];
      readonly reason: CodexIsolationError["reason"];
    };
  }[];
}> {
  const platform = productionCodexPlatform();
  const diagnosticId = randomUUID();
  const results = [];
  for (let round = 0; round < rounds; round += 1) {
    let probeCalls = 0;
    let completedPorts = 0;
    const inner: CodexPort = Object.freeze({
      id: "isolated-codex-cli",
      kind: "real",
      async run<Candidate>() {
        completedPorts += 1;
        return { candidate: undefined as Candidate, evidence: undefined! };
      },
    });
    const probe = async (
      scope: Parameters<typeof runProductionCodexReadinessProbe>[0],
    ) => {
      probeCalls += 1;
      return await runProductionCodexReadinessProbe(scope);
    };
    const fingerprint = `${readinessFingerprint(platform)}:${diagnosticId}:${round}`;
    const ports = Array.from({ length: concurrency }, () =>
      createReadinessGuardedCodexPort(inner, probe, {
        fingerprint: () => fingerprint,
      }),
    );
    const input = {} as CodexRunInput<unknown>;
    const settled = await Promise.allSettled(
      ports.map((port) => port.run(input)),
    );
    const rejected = settled.find(
      (value): value is PromiseRejectedResult => value.status === "rejected",
    );
    const failure =
      rejected?.reason instanceof CodexIsolationError
        ? rejected.reason
        : undefined;
    results.push({
      probeCalls,
      completedPorts,
      blockedPorts: settled.length - completedPorts,
      ...(failure === undefined
        ? {}
        : { failure: { check: failure.check, reason: failure.reason } }),
    });
  }
  return { rounds: results };
}

export function createCodexPortForTesting(
  platform: CodexRunnerPlatform,
  reservations: LaunchReservationReader,
): CodexPort {
  return portWithPlatform(platform, reservations);
}

export { CODEX_FAILURE_CLASSES, CodexRunnerError } from "./codexErrors";
export type {
  CommittedLaunchReservation,
  LaunchFence,
  LaunchReservationClaim,
  LaunchReservationKey,
  LaunchReservationReader,
} from "./codexReservation";
export { codexInputHash } from "./codexReservation";
export type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
  SafeCodexEvidence,
} from "./codexTypes";

import { createHash, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import type { CodexRunnerPlatform } from "./codexPlatform";
import { productionCodexPlatform } from "./codexPlatform";
import type { LaunchReservationReader } from "./codexReservation";
import { runCodexWithPlatform } from "./codexRunnerCore";
import type { CodexPort, CodexRunInput, CodexRunResult } from "./codexTypes";
import {
  CodexIsolationError,
  createReadinessGuardedCodexPort,
} from "./readiness";
import { runProductionCodexReadinessProbe } from "./readinessProbe";

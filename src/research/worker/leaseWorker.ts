import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  createOfficialAttemptHandler,
  type OfficialAttemptHandler,
  type OfficialAttemptHandlerOptions,
  type OfficialAttemptHandlerOverrides,
} from "../compositions/officialWorker";
import type { ResearchWorkSignal } from "../ports/researchQueue";
import { createLiveResearchQueue } from "../server/queue/sqsResearchQueue";
import {
  runProductionCodexWorkerAdmission,
  runProductionReadinessDiagnostic,
} from "../server/codex/codexRunner";
import { resumeCommitteeChair } from "./chairResume";
import {
  type AttemptHandler,
  type AttemptOutcome,
  createLeaseEngine,
  type WorkerAttempt,
} from "./leaseEngine";
import {
  acquireWorkerLease,
  inspectWorkerHealth,
  prepareWorkerRuntime,
  WorkerRuntimeError,
} from "./runtimeLifecycle";

const LegacyArgumentsSchema = z.tuple([
  z.literal("--database"),
  z.string().trim().min(1),
  z.literal("--owner"),
  z.string().trim().min(1).max(200),
  z.literal("--verification-outcome"),
  z.enum(["accepted", "wait-for-signal"]),
  z.enum(["--serve", "--drain"]),
]);
const RuntimeArgumentsSchema = z.union([
  z.tuple([z.enum(["serve", "readiness", "readiness-diagnostic", "health"])]),
  z.tuple([z.literal("resume-chair"), z.string().uuid(), z.string().uuid()]),
]);
const ErrorCodeSchema = z.object({ code: z.string() });

type LegacyWorkerArguments = {
  readonly kind: "legacy";
  readonly databasePath: string;
  readonly ownerId: string;
  readonly verificationOutcome: "accepted" | "wait-for-signal";
  readonly stopWhenIdle: boolean;
};
type RuntimeWorkerArguments = {
  readonly kind: "runtime";
} & (
  | {
      readonly command: "serve" | "readiness" | "readiness-diagnostic" | "health";
    }
  | {
      readonly command: "resume-chair";
      readonly runId: string;
      readonly authorizationId: string;
    }
);
type WorkerArguments = LegacyWorkerArguments | RuntimeWorkerArguments;
export class LeaseWorkerCliError extends Error {
  readonly name = "LeaseWorkerCliError";
}

function parseArguments(values: readonly string[]): WorkerArguments {
  const normalized = values[0] === "--" ? values.slice(1) : values;
  const runtime = RuntimeArgumentsSchema.safeParse(normalized);
  if (runtime.success)
    return runtime.data[0] === "resume-chair"
      ? {
          kind: "runtime",
          command: "resume-chair",
          runId: runtime.data[1],
          authorizationId: runtime.data[2],
        }
      : { kind: "runtime", command: runtime.data[0] };
  const legacy = LegacyArgumentsSchema.safeParse(normalized);
  if (!legacy.success)
    throw new LeaseWorkerCliError("Invalid lease worker arguments");
  return {
    kind: "legacy",
    databasePath: legacy.data[1],
    ownerId: legacy.data[3],
    verificationOutcome: legacy.data[5],
    stopWhenIdle: legacy.data[6] === "--drain",
  };
}

function writeLifecycle(
  value: Readonly<Record<string, string | number>>,
): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function waitForSignal(signal: AbortSignal): Promise<AttemptOutcome> {
  if (signal.aborted)
    return Promise.resolve({
      kind: "transient",
      retryAt: new Date().toISOString(),
    });
  return new Promise((resolveOutcome) => {
    signal.addEventListener(
      "abort",
      () =>
        resolveOutcome({
          kind: "transient",
          retryAt: new Date().toISOString(),
        }),
      { once: true },
    );
  });
}

function verificationHandler(
  outcome: LegacyWorkerArguments["verificationOutcome"],
  signal: AbortSignal,
): AttemptHandler {
  return {
    run: async (attempt: WorkerAttempt, attemptSignal: AbortSignal) => {
      writeLifecycle({
        kind: "attempt_started",
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
      });
      return outcome === "accepted"
        ? { kind: "accepted" }
        : waitForSignal(AbortSignal.any([attemptSignal, signal]));
    },
  };
}

export async function runLeaseWorkerProcess(
  values: readonly string[],
  handler?: AttemptHandler,
): Promise<void> {
  const argumentsValue = parseArguments(values);
  if (argumentsValue.kind === "runtime") {
    if (handler !== undefined)
      throw new LeaseWorkerCliError("Handler injection is legacy-only");
    await runRuntimeCommand(argumentsValue);
    return;
  }
  await runWorker(argumentsValue, undefined, handler);
}

export async function createRuntimeAttemptHandler(
  options: OfficialAttemptHandlerOptions,
  overrides: OfficialAttemptHandlerOverrides = {},
): Promise<OfficialAttemptHandler> {
  return await createOfficialAttemptHandler(options, overrides);
}

export async function prepareAdmittedWorkerRuntime<Runtime, Lease>(input: {
  readonly admit: () => Promise<void>;
  readonly prepare: () => Promise<Runtime>;
  readonly acquire: (runtime: Runtime) => Promise<Lease>;
}): Promise<{ readonly runtime: Runtime; readonly lease: Lease }> {
  await input.admit();
  const runtime = await input.prepare();
  const lease = await input.acquire(runtime);
  return { runtime, lease };
}

async function runRuntimeCommand(
  argumentsValue: RuntimeWorkerArguments,
): Promise<void> {
  const { command } = argumentsValue;
  if (command === "resume-chair") {
    const runtime = await prepareWorkerRuntime();
    const result = resumeCommitteeChair({
      databasePath: runtime.databasePath,
      runId: argumentsValue.runId,
      authorizationId: argumentsValue.authorizationId,
      now: new Date().toISOString(),
    });
    writeLifecycle({
      kind: "chair_resume",
      status: result.kind,
      ...(result.kind === "rejected"
        ? { reason: result.reason }
        : { grantedLaunch: result.grantedLaunch }),
    });
    if (result.kind === "rejected")
      throw new LeaseWorkerCliError(`Chair resume rejected: ${result.reason}`);
    return;
  }
  if (command === "readiness") {
    writeLifecycle({
      kind: "worker_readiness",
      status: "ready",
      ...(await runtimeDetails()),
    });
    return;
  }
  if (command === "readiness-diagnostic") {
    writeLifecycle({
      kind: "worker_readiness_diagnostic",
      result: JSON.stringify(await runProductionReadinessDiagnostic()),
    });
    return;
  }
  if (command === "health") {
    const runtime = await inspectWorkerHealth();
    writeLifecycle({
      kind: "worker_health",
      status: "ready",
      migrationsApplied: runtime.migrationsApplied,
      casDigest: runtime.casDigest,
    });
    return;
  }
  const { runtime, lease } = await prepareAdmittedWorkerRuntime({
    admit: runProductionCodexWorkerAdmission,
    prepare: prepareWorkerRuntime,
    acquire: acquireWorkerLease,
  });
  const workSignal = createLiveResearchQueue();
  let workflow: OfficialAttemptHandler | undefined;
  try {
    workflow = await createRuntimeAttemptHandler({
      dataDirectory: runtime.dataDirectory,
      databasePath: runtime.databasePath,
      migrationsDirectory: runtime.migrationsDirectory,
      ownerId: lease.ownerId,
    });
    writeLifecycle({
      kind: "worker_ready",
      status: "ready",
      migrationsApplied: runtime.migrationsApplied,
      nativeSqlite: "loaded",
      casDigest: runtime.casDigest,
    });
    await runWorker(
      {
        kind: "legacy",
        databasePath: runtime.databasePath,
        ownerId: lease.ownerId,
        verificationOutcome: "accepted",
        stopWhenIdle: false,
      },
      runtime.migrationsDirectory,
      workflow.handler,
      workSignal,
    );
  } finally {
    workSignal?.close();
    await workflow?.close();
    await lease.release();
  }
}

async function runtimeDetails(): Promise<
  Readonly<Record<string, string | number>>
> {
  const runtime = await prepareWorkerRuntime();
  return {
    migrationsApplied: runtime.migrationsApplied,
    nativeSqlite: "loaded",
    casDigest: runtime.casDigest,
  };
}

async function runWorker(
  argumentsValue: LegacyWorkerArguments,
  migrationsDirectory?: string,
  handler?: AttemptHandler,
  workSignal?: ResearchWorkSignal,
): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const engine = createLeaseEngine({
    databasePath: argumentsValue.databasePath,
    ...(migrationsDirectory === undefined ? {} : { migrationsDirectory }),
    ownerId: argumentsValue.ownerId,
    handler:
      handler ??
      verificationHandler(
        argumentsValue.verificationOutcome,
        controller.signal,
      ),
  });

  try {
    const recovered = engine.recoverExpired();
    writeLifecycle({ kind: "worker_started", recovered: recovered.length });
    await engine.runUntilStopped(controller.signal, {
      stopWhenIdle: argumentsValue.stopWhenIdle,
      ...(workSignal === undefined
        ? {}
        : { waitForWork: workSignal.wait.bind(workSignal) }),
      lifecycle: {
        heartbeat: (extended) =>
          writeLifecycle({ kind: "lease_heartbeat", extended }),
        result: (result) => {
          if (result.kind === "handled")
            writeLifecycle({
              kind: "attempt_handled",
              runId: result.attempt.runId,
              jobId: result.attempt.jobId,
              outcome: result.outcome.kind,
              ...("code" in result.outcome
                ? { code: result.outcome.code }
                : {}),
              ...("runner" in result.outcome &&
              result.outcome.runner !== undefined
                ? { runnerPhase: result.outcome.runner.phase }
                : {}),
            });
          else
            writeLifecycle({
              kind: "worker_poll",
              result: result.kind,
              ...("attempt" in result
                ? {
                    runId: result.attempt.runId,
                    jobId: result.attempt.jobId,
                  }
                : {}),
            });
        },
      },
    });
  } finally {
    controller.abort();
    await engine.shutdown();
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    writeLifecycle({ kind: "worker_stopped" });
  }
}

async function main(): Promise<void> {
  try {
    await runLeaseWorkerProcess(process.argv.slice(2));
  } catch (error) {
    const failure =
      error instanceof LeaseWorkerCliError ||
      error instanceof WorkerRuntimeError
        ? error
        : new LeaseWorkerCliError("Lease worker failed", { cause: error });
    process.stderr.write(
      `${JSON.stringify({
        kind: "worker_error",
        code: ErrorCodeSchema.safeParse(error).data?.code ?? "WORKER_FAILED",
        message: failure.message,
      })}\n`,
    );
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
)
  await main();

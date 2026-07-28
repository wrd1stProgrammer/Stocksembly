import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { executePackagedOfficialJob } from "./standalone-official-handler-fixture.mjs";
import {
  ProcessVerificationError,
  reserveLoopbackPort,
  runProcess,
  startProcess,
  stopProcess,
  waitForHttp,
  waitForJsonLine,
} from "./standalone-process.mjs";
import {
  readDurableJob,
  seedDurableJob,
} from "./standalone-worker-fixture.mjs";
import { verifyStandaloneFailures } from "./verify-standalone-worker-failures.mjs";

const workerReadySchema = z.object({
  kind: z.literal("worker_ready"),
  status: z.literal("ready"),
  migrationsApplied: z.number().int().positive(),
  nativeSqlite: z.literal("loaded"),
  casDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
const workerStatusSchema = z.object({
  kind: z.enum(["worker_readiness", "worker_health"]),
  status: z.literal("ready"),
  migrationsApplied: z.number().int().positive(),
  casDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const verifyStandaloneFull = async (sourcePackageRoot) => {
  const verificationRoot = await mkdtemp(join(tmpdir(), "stocksembly-full-"));
  let web;
  let worker;
  try {
    const packageRoot = join(verificationRoot, "standalone");
    const dataRoot = join(verificationRoot, "data");
    await cp(sourcePackageRoot, packageRoot, {
      recursive: true,
      force: true,
      dereference: true,
    });
    await assertPackage(packageRoot);
    const port = await reserveLoopbackPort();
    const environment = {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      STOCKSEMBLY_DATA_DIR: dataRoot,
    };
    web = startProcess(process.execPath, ["server.js"], {
      cwd: packageRoot,
      env: environment,
    });
    let webOutput = "";
    let webError = "";
    web.stdout.on("data", (chunk) => {
      webOutput += chunk;
    });
    web.stderr.on("data", (chunk) => {
      webError += chunk;
    });
    let webStatus;
    try {
      webStatus = await waitForHttp(port);
    } catch (error) {
      throw new ProcessVerificationError(
        "WEB_READY_TIMEOUT",
        `The loopback web process did not become ready: ${webOutput.trim()} ${webError.trim()}`,
        { cause: error },
      );
    }
    worker = startProcess(
      process.execPath,
      ["research-worker/worker.mjs", "serve"],
      { cwd: packageRoot, env: environment },
    );
    const workerReady = await waitForJsonLine(worker, workerReadySchema);
    const health = runProcess(
      process.execPath,
      ["research-worker/worker.mjs", "health"],
      { cwd: packageRoot, env: environment },
    );
    assertStatus(health, workerStatusSchema, "WORKER_HEALTH_FAILED");
    await stopProcess(worker);
    worker = undefined;
    await seedDurableJob(packageRoot, dataRoot);
    await executePackagedOfficialJob(packageRoot, dataRoot);
    const executedJob = await readDurableJob(packageRoot, dataRoot);

    worker = startProcess(
      process.execPath,
      ["research-worker/worker.mjs", "serve"],
      { cwd: packageRoot, env: environment },
    );
    const restartedWorker = await waitForJsonLine(worker, workerReadySchema);
    const durableJob = await readDurableJob(packageRoot, dataRoot);
    const jobExecuted =
      executedJob.status === "succeeded" &&
      executedJob.outcome === "accepted" &&
      executedJob.attempts === 1 &&
      executedJob.runnerEvidence === 1 &&
      executedJob.committedArtifacts === 1;
    const jobPreserved =
      durableJob.attemptId === executedJob.attemptId &&
      durableJob.artifactId === executedJob.artifactId &&
      durableJob.attempts === executedJob.attempts &&
      durableJob.committedArtifacts === executedJob.committedArtifacts &&
      durableJob.events === executedJob.events;
    const artifactPreserved =
      durableJob.artifactPresent &&
      durableJob.artifactDigest === executedJob.artifactDigest;
    if (!jobExecuted || !jobPreserved || !artifactPreserved)
      throw new ProcessVerificationError(
        "DURABLE_JOB_REOPEN_FAILED",
        "The accepted packaged worker job did not survive restart",
      );

    await stopProcess(web);
    web = startProcess(process.execPath, ["server.js"], {
      cwd: packageRoot,
      env: environment,
    });
    await waitForHttp(port);

    await stopProcess(worker);
    worker = undefined;
    await stopProcess(web);
    web = undefined;
    const failures = await verifyStandaloneFailures(
      sourcePackageRoot,
      verificationRoot,
    );
    return {
      kind: "standalone_worker_full_verified",
      web: { status: "ready", host: "127.0.0.1", httpStatus: webStatus },
      worker: { status: workerReady.status },
      persistence: {
        migrationsApplied: restartedWorker.migrationsApplied,
        nativeSqlite: "loaded",
        cas: "written",
        casDigest: restartedWorker.casDigest,
        jobExecuted,
        jobPreserved,
        artifactPreserved,
        attempts: durableJob.attempts,
        committedArtifacts: durableJob.committedArtifacts,
        attemptId: durableJob.attemptId,
        artifactId: durableJob.artifactId,
      },
      restarts: { web: "ready", worker: restartedWorker.status },
      failures,
    };
  } finally {
    if (worker !== undefined) await stopProcess(worker);
    if (web !== undefined) await stopProcess(web);
    await rm(verificationRoot, { recursive: true, force: true });
  }
};

const assertPackage = async (packageRoot) => {
  const files = [
    "server.js",
    "research-worker/worker.mjs",
    "research-worker/leaseWorker.js",
    "migrations/001_workflow_core.sql",
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  ];
  const statuses = await Promise.all(
    files.map((file) => stat(join(packageRoot, file))),
  );
  if (statuses.some((status) => !status.isFile())) {
    throw new ProcessVerificationError(
      "STANDALONE_PACKAGE_INVALID",
      "The real worker package is incomplete",
    );
  }
};

const assertStatus = (result, schema, code) => {
  if (result.status !== 0)
    throw new ProcessVerificationError(code, result.stderr);
  schema.parse(JSON.parse(result.stdout.trim().split("\n").at(-1)));
};

import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  ProcessVerificationError,
  reserveLoopbackPort,
  runProcess,
  startProcess,
  stopProcess,
  waitForHttp,
  waitForJsonLine,
} from "./standalone-process.mjs";

const WorkerReadySchema = z.object({
  kind: z.literal("worker_ready"),
  status: z.literal("ready"),
});
const WorkerErrorSchema = z.object({
  kind: z.literal("worker_error"),
  code: z.string().min(1),
});

const workerArguments = (command) => ["research-worker/worker.mjs", command];

const runWorker = (packageRoot, dataRoot, command = "readiness") =>
  runProcess(process.execPath, workerArguments(command), {
    cwd: packageRoot,
    env: { ...process.env, STOCKSEMBLY_DATA_DIR: dataRoot },
    timeout: 10_000,
  });

const copyPackage = async (source, root, name) => {
  const destination = join(root, name);
  await cp(source, destination, {
    recursive: true,
    force: true,
    dereference: true,
  });
  return destination;
};

const assertError = (result, expectedCode) => {
  if (result.status === 0)
    throw new ProcessVerificationError(
      "FAILURE_MODE_FALSE_SUCCESS",
      `${expectedCode} exited zero`,
    );
  const parsed = WorkerErrorSchema.parse(
    JSON.parse(result.stderr.trim().split("\n").at(-1)),
  );
  if (parsed.code !== expectedCode)
    throw new ProcessVerificationError(
      "FAILURE_CODE_MISMATCH",
      `${parsed.code} !== ${expectedCode}`,
    );
  return parsed.code;
};

const verifyWebOnlyRejection = async (packageRoot, dataRoot) => {
  const port = await reserveLoopbackPort();
  const environment = {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    STOCKSEMBLY_DATA_DIR: dataRoot,
  };
  const web = startProcess(process.execPath, ["server.js"], {
    cwd: packageRoot,
    env: environment,
  });
  try {
    const httpStatus = await waitForHttp(port);
    const worker = runProcess(process.execPath, workerArguments("readiness"), {
      cwd: packageRoot,
      env: environment,
    });
    const workerCode = assertError(worker, "SQLITE_NATIVE_UNAVAILABLE");
    const combinedReady =
      httpStatus >= 200 && httpStatus < 500 && worker.status === 0;
    const rejected =
      httpStatus >= 200 &&
      httpStatus < 500 &&
      worker.status !== 0 &&
      workerCode === "SQLITE_NATIVE_UNAVAILABLE" &&
      !combinedReady;
    if (!rejected)
      throw new ProcessVerificationError(
        "WEB_ONLY_FALSE_SUCCESS",
        "A green web process was accepted without worker readiness",
      );
    return {
      httpStatus,
      workerStatus: worker.status,
      workerCode,
      combinedReady,
      rejected,
    };
  } finally {
    await stopProcess(web);
  }
};

export const verifyStandaloneFailures = async (
  sourceRoot,
  verificationRoot,
) => {
  const missing = await copyPackage(
    sourceRoot,
    verificationRoot,
    "missing-migrations",
  );
  await rm(join(missing, "migrations"), { recursive: true, force: true });
  const missingCode = assertError(
    runWorker(missing, join(verificationRoot, "missing-data")),
    "MIGRATIONS_UNAVAILABLE",
  );

  const readonlyRoot = join(verificationRoot, "readonly-data");
  await mkdir(readonlyRoot, { mode: 0o500 });
  const readonlyResult = runWorker(sourceRoot, readonlyRoot);
  await chmod(readonlyRoot, 0o700);
  const readonlyCode = assertError(readonlyResult, "WORKER_DATA_READ_ONLY");

  const occupiedData = join(verificationRoot, "occupied-data");
  const occupiedEnvironment = {
    ...process.env,
    STOCKSEMBLY_DATA_DIR: occupiedData,
  };
  const holder = startProcess(process.execPath, workerArguments("serve"), {
    cwd: sourceRoot,
    env: occupiedEnvironment,
  });
  let occupiedCode;
  try {
    await waitForJsonLine(holder, WorkerReadySchema);
    occupiedCode = assertError(
      runWorker(sourceRoot, occupiedData, "serve"),
      "WORKER_LEASE_OCCUPIED",
    );
  } finally {
    await stopProcess(holder);
  }

  const native = await copyPackage(
    sourceRoot,
    verificationRoot,
    "missing-native",
  );
  await rm(
    join(
      native,
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ),
  );
  const webOnly = await verifyWebOnlyRejection(
    native,
    join(verificationRoot, "native-data"),
  );
  return {
    missingMigrations: missingCode,
    readOnlyDataRoot: readonlyCode,
    occupiedWorkerLease: occupiedCode,
    missingNativeBinding: webOnly.workerCode,
    webOnlySuccessRejected: webOnly.rejected,
    webOnly: {
      httpStatus: webOnly.httpStatus,
      workerStatus: webOnly.workerStatus,
      workerCode: webOnly.workerCode,
      combinedReady: webOnly.combinedReady,
    },
  };
};

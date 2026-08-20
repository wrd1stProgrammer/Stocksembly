import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let nativeBindingValidated = false;

try {
  const workerDirectory = dirname(fileURLToPath(import.meta.url));
  const nativeBinding = join(
    workerDirectory,
    "../node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  );
  const bindingStatus = await stat(nativeBinding);
  if (!bindingStatus.isFile()) throw new Error("native binding is not a file");
  nativeBindingValidated = true;
  const worker = await import("./leaseWorker.js");
  const argumentsValue = process.argv.slice(2);
  if (argumentsValue[0] === "serve") {
    const briefing = await import("../briefing-worker/briefingWorker.js");
    await Promise.all([
      worker.runLeaseWorkerProcess(argumentsValue),
      briefing.runBriefingWorkerProcess(argumentsValue),
    ]);
  } else {
    await worker.runLeaseWorkerProcess(argumentsValue);
  }
} catch (error) {
  const reportedCode =
    error instanceof Error && "code" in error ? error.code : undefined;
  const reportedCheck =
    error instanceof Error &&
    "check" in error &&
    typeof error.check === "string"
      ? error.check
      : undefined;
  const reportedReason =
    error instanceof Error &&
    "reason" in error &&
    typeof error.reason === "string"
      ? error.reason
      : undefined;
  const code = !nativeBindingValidated
    ? "SQLITE_NATIVE_UNAVAILABLE"
    : [
          "CODEX_ISOLATION_FAILED",
          "MIGRATIONS_UNAVAILABLE",
          "WORKER_DATA_READ_ONLY",
          "WORKER_LEASE_OCCUPIED",
          "WORKER_NOT_RUNNING",
          "WORKER_RUNTIME_INVALID",
        ].includes(reportedCode)
      ? reportedCode
      : "WORKER_FAILED";
  await new Promise((resolve) =>
    process.stderr.write(
      `${JSON.stringify({
        kind: "worker_error",
        code,
        ...(reportedCheck ? { check: reportedCheck } : {}),
        ...(reportedReason ? { reason: reportedReason } : {}),
        message:
          code === "SQLITE_NATIVE_UNAVAILABLE"
            ? "The packaged better-sqlite3 native binding is unavailable"
            : error instanceof Error
              ? error.message
              : "The packaged research worker failed",
      })}\n`,
      resolve,
    ),
  );
  process.exit(1);
}

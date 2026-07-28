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
  await worker.runLeaseWorkerProcess(process.argv.slice(2));
} catch (error) {
  const reportedCode =
    error instanceof Error && "code" in error ? error.code : undefined;
  const code = !nativeBindingValidated
    ? "SQLITE_NATIVE_UNAVAILABLE"
    : [
          "MIGRATIONS_UNAVAILABLE",
          "WORKER_DATA_READ_ONLY",
          "WORKER_LEASE_OCCUPIED",
          "WORKER_NOT_RUNNING",
          "WORKER_RUNTIME_INVALID",
        ].includes(reportedCode)
      ? reportedCode
      : "WORKER_FAILED";
  process.stderr.write(
    `${JSON.stringify({
      kind: "worker_error",
      code,
      message:
        code === "SQLITE_NATIVE_UNAVAILABLE"
          ? "The packaged better-sqlite3 native binding is unavailable"
          : error instanceof Error
            ? error.message
            : "The packaged research worker failed",
    })}\n`,
  );
  process.exitCode = 1;
}

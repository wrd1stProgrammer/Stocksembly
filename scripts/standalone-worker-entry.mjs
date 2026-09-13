import { rm, stat, writeFile } from "node:fs/promises";

let driverValidated = false;
try {
  const driver = await stat(
    new URL("../node_modules/pg/package.json", import.meta.url),
  );
  if (!driver.isFile())
    throw new Error("The packaged PostgreSQL driver is unavailable");
  driverValidated = true;
  const worker = await import("./leaseWorker.js");
  const argumentsValue = process.argv.slice(2);
  if (argumentsValue[0] === "serve") {
    const briefing = await import("../briefing-worker/briefingWorker.js");
    const drainFile = "/tmp/stocksembly-worker-drain";
    process.env.STOCKSEMBLY_WORKER_DRAIN_FILE = drainFile;
    await Promise.all([
      rm(drainFile, { force: true }),
      rm(`${drainFile}.ready`, { force: true }),
    ]);
    await Promise.all([
      worker.runLeaseWorkerProcess(argumentsValue),
      briefing.runBriefingWorkerProcess(argumentsValue),
    ]);
    await writeFile(`${drainFile}.ready`, "ready", { mode: 0o600 });
    await new Promise((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
      setInterval(() => {}, 60_000);
    });
    process.exit(0);
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
  const code = !driverValidated
    ? "POSTGRES_DRIVER_UNAVAILABLE"
    : [
          "POSTGRES_UNAVAILABLE",
          "POSTGRES_NOT_CONFIGURED",
          "POSTGRES_MIGRATIONS_REQUIRED",
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
          error instanceof Error
            ? error.message
            : "The packaged research worker failed",
      })}\n`,
      resolve,
    ),
  );
  if (
    process.argv[2] === "serve" &&
    code === "CODEX_ISOLATION_FAILED" &&
    reportedCheck === "login"
  ) {
    process.stderr.write(
      `${JSON.stringify({ kind: "worker_retry_wait", retryAfterMs: 60_000 })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
  process.exit(1);
}

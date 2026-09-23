/** Sends one explicitly labelled verification trace/profile and real runtime metrics. */
import * as Sentry from "@sentry/node";
import {
  initializeMonitoring,
  recordWorkerOutcome,
  traceWorkerAttempt,
} from "../src/lib/observability/server";

if (process.argv[2] === "--help") {
  console.log(
    "Usage: SENTRY_DSN=... node verify-sentry-performance.js <web|worker> [--pool]\nSends a verification-only CPU profile and one minute of runtime metrics.",
  );
  process.exit(0);
}
const runtime = process.argv[2];
if (runtime !== "web" && runtime !== "worker")
  throw new Error("Choose web or worker");
if (!process.env["SENTRY_DSN"]) throw new Error("SENTRY_DSN is required");
process.env["SENTRY_ENVIRONMENT"] = "verification";
process.env["SENTRY_TRACES_SAMPLE_RATE"] = "1";
process.env["SENTRY_PROFILE_SESSION_SAMPLE_RATE"] = "1";
process.env["SENTRY_METRICS_ENABLED"] = "true";
await initializeMonitoring(runtime);
const transport = Sentry.getClient()?.getTransport();
if (transport) {
  const send = transport.send.bind(transport);
  transport.send = async (envelope) => {
    const result = await send(envelope);
    console.log(
      JSON.stringify({
        items: envelope[1].map(([header]) => header.type),
        statusCode: result.statusCode,
        rateLimits: result.headers?.["x-sentry-rate-limits"],
      }),
    );
    return result;
  };
}
const work = async () => {
  const deadline = performance.now() + 300;
  let iterations = 0;
  while (performance.now() < deadline) {
    JSON.stringify({
      verification: true,
      sample: Array.from({ length: 100 }, (_, i) => i * i),
    });
    iterations++;
  }
  return iterations;
};
if (runtime === "worker") {
  await traceWorkerAttempt("verification", "verification", work);
  recordWorkerOutcome("verification", "verification", "accepted");
} else {
  await Sentry.startSpan({ name: "GET /", op: "http.server" }, work);
}
// Optional loopback-only failure exercises the actual pool instrumentation.
// It never connects to the production database or uses production credentials.
let closePool: (() => Promise<void>) | undefined;
if (process.argv.includes("--pool")) {
  const { RotationAwarePool } = await import(
    "../src/server/database/rotationAwarePool"
  );
  const pool = new RotationAwarePool(
    {
      host: "127.0.0.1",
      port: 1,
      user: "verification",
      password: "verification",
      database: "verification",
      connectionTimeoutMillis: 100,
      max: 1,
    },
    "research",
  );
  const client = await pool.connect().catch(() => undefined);
  client?.release();
  closePool = () => pool.end();
}
// Allow one real 60-second runtime sample, then flush and exit.
await new Promise((resolve) => setTimeout(resolve, 61_000));
await closePool?.();
const flushed = await Sentry.close(10_000);
console.log(JSON.stringify({ environment: "verification", runtime, flushed }));
if (!flushed) process.exitCode = 1;

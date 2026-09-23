import * as Sentry from "@sentry/node";
import { metricsEnabled, startRuntimeMetrics } from "./metrics";
import { scrubEvent, scrubMetric, scrubTransaction } from "./privacy";

export async function initializeMonitoring(runtime: "web" | "worker") {
  if (!process.env["SENTRY_DSN"] || Sentry.isInitialized()) return;
  const profileRate = sampleRate(
    process.env["SENTRY_PROFILE_SESSION_SAMPLE_RATE"],
    1,
  );
  const profiling = await profilingIntegrations(profileRate > 0);
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment:
      process.env["SENTRY_ENVIRONMENT"] ??
      process.env["NODE_ENV"] ??
      "development",
    ...(process.env["SENTRY_RELEASE"]
      ? { release: process.env["SENTRY_RELEASE"] }
      : {}),
    sendDefaultPii: false,
    tracesSampleRate: sampleRate(process.env["SENTRY_TRACES_SAMPLE_RATE"], 0.1),
    profileSessionSampleRate: profileRate,
    profileLifecycle: "trace",
    enableMetrics: process.env["SENTRY_METRICS_ENABLED"] !== "false",
    beforeSendMetric: (metric) => scrubMetric(metric, runtime),
    initialScope: { tags: { runtime } },
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
    integrations: (defaults) => [
      ...profiling,
      ...defaults.filter(
        (item) =>
          !/Console|LocalVariables|OpenAI|Anthropic|GoogleGenAI|LangChain|VercelAI/.test(
            item.name,
          ),
      ),
    ],
  });
  startRuntimeMetrics();
}

export async function traceWorkerAttempt<T>(
  runId: string,
  jobId: string,
  execute: () => Promise<T>,
): Promise<T> {
  if (!Sentry.isInitialized()) return execute();
  return Sentry.withIsolationScope(async (scope) => {
    scope.setTags({ runId, jobId, runtime: "worker" });
    return Sentry.startSpan(
      { name: "research.attempt", op: "research.attempt" },
      async () => {
        const started = performance.now();
        try {
          return await execute();
        } catch (error) {
          Sentry.captureException(error);
          throw error;
        } finally {
          if (metricsEnabled())
            Sentry.metrics.distribution(
              "research.attempt.duration",
              performance.now() - started,
              { unit: "millisecond" },
            );
        }
      },
    );
  });
}

export function recordWorkerOutcome(
  runId: string,
  jobId: string,
  outcome: string,
) {
  if (metricsEnabled())
    Sentry.metrics.count("research.attempt.outcome", 1, {
      attributes: { outcome: normalizeOutcome(outcome) },
    });
  if (
    !["incomplete", "degraded", "failed"].includes(outcome) ||
    !Sentry.isInitialized()
  )
    return;
  Sentry.withScope((scope) => {
    scope.setTags({ runId, jobId, outcome, runtime: "worker" });
    const error = new Error("Research attempt needs attention");
    error.name = "ResearchAttemptIncomplete";
    Sentry.captureException(error);
  });
}

export function sampleRate(
  value: string | undefined,
  fallback: number,
): number {
  if (!value?.trim()) return fallback;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback;
}

function normalizeOutcome(value: string): string {
  return [
    "accepted",
    "published",
    "completed",
    "incomplete",
    "degraded",
    "failed",
    "cancelled",
    "retry",
    "retryable",
    "transient",
    "permanent",
    "repair",
    "attention",
  ].includes(value)
    ? value
    : "other";
}

async function profilingIntegrations(enabled: boolean) {
  if (!enabled) return [];
  try {
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node");
    return [nodeProfilingIntegration()];
  } catch {
    // Telemetry must not prevent application startup on an unsupported ABI.
    console.warn("SENTRY_PROFILING_UNAVAILABLE");
    return [];
  }
}

import * as Sentry from "@sentry/node";
import { scrubEvent, scrubTransaction } from "./privacy";

export function initializeMonitoring(runtime: "web" | "worker") {
  if (!process.env["SENTRY_DSN"] || Sentry.isInitialized()) return;
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    ...(process.env["NODE_ENV"]
      ? { environment: process.env["NODE_ENV"] }
      : {}),
    ...(process.env["SENTRY_RELEASE"]
      ? { release: process.env["SENTRY_RELEASE"] }
      : {}),
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    initialScope: { tags: { runtime } },
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
    integrations: (defaults) =>
      defaults.filter(
        (item) =>
          !/Console|LocalVariables|OpenAI|Anthropic|GoogleGenAI|LangChain|VercelAI/.test(
            item.name,
          ),
      ),
  });
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
        try {
          return await execute();
        } catch (error) {
          Sentry.captureException(error);
          throw error;
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

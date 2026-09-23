import type { ErrorEvent, init } from "@sentry/browser";

type TransactionEvent = Parameters<
  NonNullable<NonNullable<Parameters<typeof init>[0]>["beforeSendTransaction"]>
>[0];

// Use an allowlist: provider payloads, SQL parameters, cookies and prompts never
// belong in performance telemetry. Stack locations and timings remain useful.
export function scrubEvent<T extends ErrorEvent | TransactionEvent>(
  event: T,
): T {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.message;
  delete event.logentry;
  delete event.server_name;
  if (event.transaction) event.transaction = routeGroup(event.transaction);
  const profile = event.contexts?.["profile"];
  const profilerId = profile?.["profiler_id"];
  event.contexts = event.contexts?.trace ? { trace: event.contexts.trace } : {};
  if (typeof profilerId === "string" && /^[a-f0-9]{32}$/.test(profilerId)) {
    // Continuous profiling uses profiler_id; the SDK's ProfileContext type
    // still requires the legacy profile_id, so assign the generic context.
    Object.assign(event.contexts, { profile: { profiler_id: profilerId } });
  }
  if (event.contexts?.trace) event.contexts.trace.data = {};
  event.tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) =>
      ["runtime", "runId", "jobId", "outcome", "errorCode"].includes(key),
    ),
  );
  for (const exception of event.exception?.values ?? []) {
    exception.value = "Error details omitted for privacy";
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.context_line;
    }
  }
  return event;
}

function routeGroup(name: string | undefined): string {
  if (name?.includes("research.attempt")) return "research.attempt";
  if (name?.includes("/api/research/runs")) return "/api/research/runs/:id";
  if (name?.includes("/api/research/reports"))
    return "/api/research/reports/:id";
  if (name?.includes("/api/tickers") || name?.includes("/api/search"))
    return "/api/search";
  if (name?.includes("/api/auth") || name?.includes("/login")) return "/auth";
  if (name?.includes("/research-room")) return "/research-room/:id";
  if (name === "/" || name === "GET /") return "/";
  return "other";
}

export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  scrubEvent(event);
  for (const span of event.spans ?? []) {
    span.description = span.op ?? "operation";
    span.data = {};
  }
  // Names are intentionally coarse; route groups can be compared without IDs,
  // query strings or user-controlled transaction names leaving the application.
  event.transaction = routeGroup(event.transaction);
  if (event.contexts?.trace) event.contexts.trace.data = {};
  return event;
}

type Metric = Parameters<
  NonNullable<NonNullable<Parameters<typeof init>[0]>["beforeSendMetric"]>
>[0];
export function scrubMetric(
  metric: Metric,
  runtime: "web" | "worker",
): Metric | null {
  if (
    !/^(process\.|db\.pool\.|research\.attempt\.)/.test(metric.name) ||
    !Number.isFinite(metric.value)
  )
    return null;
  const attributes: Record<string, string> = { runtime };
  for (const key of [
    "sentry.environment",
    "sentry.release",
    "sentry.sdk.name",
    "sentry.sdk.version",
  ]) {
    const value = metric.attributes?.[key];
    if (typeof value === "string") attributes[key] = value;
  }
  const pool = metric.attributes?.["pool"];
  if (
    typeof pool === "string" &&
    ["accounts", "research", "other"].includes(pool)
  )
    attributes["pool"] = pool;
  const outcome = metric.attributes?.["outcome"];
  if (
    typeof outcome === "string" &&
    [
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
      "other",
    ].includes(outcome)
  )
    attributes["outcome"] = outcome;
  metric.attributes = attributes;
  return metric;
}

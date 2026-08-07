import type {
  CodexFailureClass,
  CodexRunnerError,
} from "../server/codex/codexErrors";
import type { AttemptOutcome } from "./leaseEngineTypes";

type RunnerFailureContext = {
  readonly now: string;
  readonly failures: number;
  readonly random: () => number;
  readonly retryClassification?: "transient" | "repair";
};

function after(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function retryDelayMs(failures: number, random: () => number): number {
  const exponential = Math.min(5 * 60_000, 5_000 * 2 ** failures);
  return Math.round(exponential * (0.75 + random() * 0.5));
}

function permanentCode(code: CodexFailureClass): string {
  return `codex_${code}`;
}

export function routeRunnerFailure(
  error: CodexRunnerError,
  context: RunnerFailureContext,
): AttemptOutcome {
  const runner =
    error.phase === undefined ? {} : { runner: { phase: error.phase } };
  switch (error.code) {
    case "cancelled":
      return { kind: "incomplete", code: "cancelled" };
    case "output_invalid":
    case "tool_event":
      return {
        kind: "repair",
        code:
          error.code === "tool_event"
            ? "forbidden_tool_event"
            : "invalid_model_output",
        retryAt: context.now,
      };
    case "process_failed":
    case "timeout":
    case "inactivity_timeout":
    case "network_unavailable":
    case "rate_limited":
      if (context.failures >= 2)
        return {
          kind: "attention",
          code: "external_dependency_cooling_down",
          retryAt: after(
            context.now,
            retryDelayMs(context.failures, context.random),
          ),
          ...runner,
          ...(error.process === undefined
            ? {}
            : { diagnostics: error.process }),
        };
      return {
        kind: "transient",
        code: permanentCode(error.code),
        ...runner,
        ...(error.process === undefined ? {} : { diagnostics: error.process }),
        retryAt:
          error.retryAt === undefined || Number.isNaN(Date.parse(error.retryAt))
            ? after(context.now, retryDelayMs(context.failures, context.random))
            : error.retryAt,
      };
    case "policy_violation":
    case "origin_untrusted":
    case "link_untrusted":
    case "auth_unavailable":
    case "schema_invalid":
    case "rights_denied":
      return {
        kind: "permanent",
        code: permanentCode(error.code),
        ...runner,
        ...(error.process === undefined ? {} : { diagnostics: error.process }),
      };
  }
}

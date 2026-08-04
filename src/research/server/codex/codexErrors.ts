export const CODEX_FAILURE_CLASSES = [
  "policy_violation",
  "origin_untrusted",
  "link_untrusted",
  "auth_unavailable",
  "process_failed",
  "output_invalid",
  "tool_event",
  "timeout",
  "inactivity_timeout",
  "network_unavailable",
  "rate_limited",
  "schema_invalid",
  "rights_denied",
  "cancelled",
] as const;

export type CodexFailureClass = (typeof CODEX_FAILURE_CLASSES)[number];

export type SafeProcessDiagnostics = {
  readonly exitCode: number;
  readonly signal: string | null;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly durationMs: number;
};

export type SafeCodexRunnerPhase =
  | "input_validation"
  | "reservation_validation"
  | "host_policy"
  | "sandbox_binary"
  | "certificate"
  | "origin_protection"
  | "runtime_prepare"
  | "sandbox_profile"
  | "manifest_write"
  | "signature_probe"
  | "version_probe"
  | "model_probe"
  | "output_contract"
  | "launch_execution";

const SAFE_MESSAGES = Object.freeze({
  policy_violation: "Codex launch policy rejected the request",
  origin_untrusted: "Codex origin verification failed",
  link_untrusted: "Codex protected-link verification failed",
  auth_unavailable: "Codex authentication is unavailable",
  process_failed: "Codex process failed",
  output_invalid: "Codex output was invalid",
  tool_event: "Codex emitted a forbidden tool event",
  timeout: "Codex stage timed out",
  inactivity_timeout: "Codex process stopped producing activity",
  network_unavailable: "Codex network dependency is unavailable",
  rate_limited: "Codex service rate limit was reached",
  schema_invalid: "Codex schema contract was rejected",
  rights_denied: "Codex evidence rights were denied",
  cancelled: "Codex stage was cancelled",
} satisfies Readonly<Record<CodexFailureClass, string>>);

export class CodexRunnerError extends Error {
  readonly code: CodexFailureClass;
  readonly retryAt?: string;
  readonly process?: SafeProcessDiagnostics;
  readonly phase?: SafeCodexRunnerPhase;

  constructor(
    code: CodexFailureClass,
    options: {
      readonly retryAt?: string;
      readonly process?: SafeProcessDiagnostics;
      readonly phase?: SafeCodexRunnerPhase;
    } = {},
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = "CodexRunnerError";
    this.code = code;
    if (options.retryAt !== undefined) this.retryAt = options.retryAt;
    if (options.process !== undefined) this.process = options.process;
    if (options.phase !== undefined) this.phase = options.phase;
  }
}

export function asCodexRunnerError(error: unknown): CodexRunnerError {
  if (error instanceof CodexRunnerError) return error;
  return new CodexRunnerError("process_failed");
}

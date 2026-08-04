import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexRunnerError } from "./codexErrors";
import {
  CodexIsolationError,
  type ReadinessCheck,
  type ReadinessReason,
} from "./readiness";

export function codexIsolationError(
  error: CodexRunnerError,
): CodexIsolationError {
  let check: ReadinessCheck;
  let reason: ReadinessReason;
  switch (error.code) {
    case "origin_untrusted":
      check = "binary";
      reason = "binary_verify";
      break;
    case "link_untrusted":
      check = "inode";
      reason = "binary_verify";
      break;
    case "auth_unavailable":
      check = "login";
      reason = "login_probe";
      break;
    case "tool_event":
      check = "tool";
      reason = "runner_contract";
      break;
    case "output_invalid":
    case "schema_invalid":
      check = "schema";
      reason = "runner_contract";
      break;
    case "policy_violation":
      check = "environment";
      reason = "runner_contract";
      break;
    case "process_failed":
    case "timeout":
    case "inactivity_timeout":
    case "network_unavailable":
    case "rate_limited":
    case "rights_denied":
    case "cancelled":
      check = "probe";
      reason = "runner_process";
      break;
  }
  const phaseReason =
    error.phase === "input_validation" ||
    error.phase === "reservation_validation" ||
    error.phase === "host_policy" ||
    error.phase === "origin_protection" ||
    error.phase === "runtime_prepare"
    || error.phase === "sandbox_profile"
    || error.phase === "manifest_write"
    || error.phase === "signature_probe"
    || error.phase === "version_probe"
    || error.phase === "model_probe"
      ? error.phase
      : error.phase === "sandbox_binary"
        ? "binary_verify"
        : error.phase === "certificate"
          ? "certificate_probe"
          : undefined;
  return new CodexIsolationError(check, phaseReason ?? reason);
}

export async function createReadinessRoot(parentDirectory = tmpdir()): Promise<string> {
  return await realpath(
    await mkdtemp(join(parentDirectory, ".stocksembly-readiness-")),
  );
}

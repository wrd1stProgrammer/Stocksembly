import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexRunnerError } from "./codexErrors";
import { CodexIsolationError, type ReadinessCheck } from "./readiness";

export function codexIsolationError(
  error: CodexRunnerError,
): CodexIsolationError {
  let check: ReadinessCheck;
  switch (error.code) {
    case "origin_untrusted":
      check = "binary";
      break;
    case "link_untrusted":
      check = "inode";
      break;
    case "auth_unavailable":
      check = "login";
      break;
    case "tool_event":
      check = "tool";
      break;
    case "output_invalid":
    case "schema_invalid":
      check = "schema";
      break;
    case "policy_violation":
      check = "environment";
      break;
    case "process_failed":
    case "timeout":
    case "inactivity_timeout":
    case "network_unavailable":
    case "rate_limited":
    case "rights_denied":
    case "cancelled":
      check = "probe";
      break;
  }
  return new CodexIsolationError(check);
}

export async function createReadinessRoot(parentDirectory = tmpdir()): Promise<string> {
  return await realpath(
    await mkdtemp(join(parentDirectory, ".stocksembly-readiness-")),
  );
}

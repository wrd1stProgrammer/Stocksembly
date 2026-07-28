import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateContract } from "./verify-scope-fidelity-contract.mjs";
import {
  BASELINE,
  BASELINE_SHA256,
  extractQuotedList,
  jsonError,
  VERIFIER,
  VERIFIER_SHA256,
} from "./verify-scope-fidelity-core.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") continue;
    if (value === "--root") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error("ROOT_REQUIRED");
      args.root = resolve(next);
      index += 1;
      continue;
    }
    if (value === "--allow-path" || value === "--allowlist")
      throw new Error("ALLOWLIST_OVERRIDE_REJECTED");
    throw new Error("CLI_ARGUMENT_REJECTED");
  }
  return args;
}

function run(root) {
  const verifierPath = join(root, VERIFIER);
  const baselinePath = join(root, BASELINE);
  if (sha256File(baselinePath) !== BASELINE_SHA256)
    return jsonError(
      "IMMUTABLE_SCOPE_REJECTED",
      "SCOPE_BASELINE_HASH_MISMATCH",
    );
  if (sha256File(verifierPath) !== VERIFIER_SHA256)
    return jsonError(
      "IMMUTABLE_SCOPE_REJECTED",
      "SCOPE_VERIFIER_HASH_MISMATCH",
    );
  const verifier = spawnSync(
    process.execPath,
    [verifierPath, "--phase", "final"],
    { cwd: root, encoding: "utf8" },
  );
  if (verifier.status !== 0)
    return jsonError(
      "IMMUTABLE_SCOPE_REJECTED",
      verifier.stderr.trim().split(" ")[0] || "IMMUTABLE_VERIFIER_FAILED",
    );
  const verifierSource = readFileSync(verifierPath, "utf8");
  const policy = {
    source: VERIFIER,
    baselineSha256: BASELINE_SHA256,
    verifierSha256: VERIFIER_SHA256,
    allowlistSource: "immutable-verifier",
    mutableExact: extractQuotedList(verifierSource, "MUTABLE_EXACT"),
    mutablePrefixes: extractQuotedList(verifierSource, "MUTABLE_PREFIXES"),
  };
  const verified = validateContract(root);
  return {
    status: "pass",
    phase: "implementation",
    policy,
    contract: verified.contract,
    architecture: verified.architecture,
    source: verified.source,
    immutableVerifier: JSON.parse(verifier.stdout),
  };
}

let result;
try {
  result = run(parseArgs(process.argv.slice(2)).root);
} catch (error) {
  const reason = error instanceof Error ? error.message : "UNKNOWN_FAILURE";
  const code =
    reason === "ALLOWLIST_OVERRIDE_REJECTED"
      ? reason
      : reason.startsWith("CONTRACT_") ||
          reason.endsWith("_INVALID") ||
          reason.endsWith("_DRIFT")
        ? "DESIGN_CONTRACT_INVALID"
        : "CHECKER_INPUT_INVALID";
  result = jsonError(code, reason);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status !== "pass") process.exitCode = 1;

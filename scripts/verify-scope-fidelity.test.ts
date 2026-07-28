import { spawnSync } from "node:child_process";
import {
  cpSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const CHECKER = "scripts/verify-scope-fidelity.mjs";
const BASELINE = ".omo/plans/live-research-office.scope-baseline.json";
const VERIFIER = ".omo/plans/live-research-office.verify-scope-anchor.mjs";
const ANCHOR_HASH =
  "b281bca68228e37e45fad01c347fa38e29c6e0e93d4e0c9da0f9c5e612c2b62b";
const VERIFIER_HASH =
  "4b3e202144f2967a875b3f73e107abf9fd7e440374d1f4608f44a82f11a5bf01";

function runChecker(args: readonly string[] = []) {
  return spawnSync(process.execPath, [CHECKER, "--json", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function copyOwned(source: string, target: string): void {
  rmSync(target, { force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
}

function copyScopeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "stocksembly-scope-"));
  const baselinePath = join(process.cwd(), BASELINE);
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  for (const entry of baseline.entries) {
    const source = join(process.cwd(), entry.path);
    const target = join(root, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.kind === "file") linkSync(source, target);
    else if (entry.kind === "symlink")
      symlinkSync(readlinkSync(source), target);
  }
  copyOwned(join(process.cwd(), CHECKER), join(root, CHECKER));
  copyOwned(
    join(process.cwd(), "scripts/verify-scope-fidelity-core.mjs"),
    join(root, "scripts/verify-scope-fidelity-core.mjs"),
  );
  copyOwned(
    join(process.cwd(), "scripts/verify-scope-fidelity-contract.mjs"),
    join(root, "scripts/verify-scope-fidelity-contract.mjs"),
  );
  copyOwned(
    join(process.cwd(), "docs/architecture/research-runtime.md"),
    join(root, "docs/architecture/research-runtime.md"),
  );
  copyOwned(baselinePath, join(root, BASELINE));
  copyOwned(join(process.cwd(), VERIFIER), join(root, VERIFIER));
  return root;
}

function replaceFixture(
  root: string,
  file: string,
  from: string,
  to: string,
): void {
  const target = join(root, file);
  const content = readFileSync(target, "utf8");
  rmSync(target, { force: true });
  writeFileSync(target, content.replace(from, to));
}

function runScopeFixture(change: (root: string) => void) {
  const root = copyScopeFixture();
  try {
    change(root);
    return runChecker(["--root", root]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runRootCacheFixture(contents: readonly string[]) {
  return runScopeFixture((root) => {
    const cache = join(root, "tsconfig.tsbuildinfo");
    rmSync(cache, { force: true });
    for (const content of contents) writeFileSync(cache, content);
  });
}

describe("scope fidelity checker", () => {
  it("keeps the checker under the pure-LOC policy", () => {
    const source = readFileSync(join(process.cwd(), CHECKER), "utf8");
    const pureLoc = source
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("//")).length;
    expect(pureLoc).toBeLessThanOrEqual(250);
  });

  it("emits a structured implementation policy bound to the immutable verifier", () => {
    // Given
    const result = runChecker();
    // When
    const output = JSON.parse(result.stdout);
    // Then
    expect(result.status).toBe(0);
    expect(output).toMatchObject({
      status: "pass",
      phase: "implementation",
      policy: {
        allowlistSource: "immutable-verifier",
        baselineSha256: ANCHOR_HASH,
        verifierSha256: VERIFIER_HASH,
      },
    });
    expect(output.contract.transcriptGroups).toHaveLength(8);
    expect(output.contract.roster.count).toBe(11);
    expect(output.architecture.routeHandlersExecuteResearch).toBe(false);
  });

  it("rejects unsupported policy overrides and malformed command input", () => {
    // Given / When
    const allowlist = runChecker(["--allow-path", "PRODUCT.md"]);
    const unknown = runChecker(["--policy", "local.json"]);
    // Then
    expect(allowlist.status).not.toBe(0);
    expect(JSON.parse(allowlist.stdout)).toMatchObject({
      code: "ALLOWLIST_OVERRIDE_REJECTED",
    });
    expect(unknown.status).not.toBe(0);
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      code: "CHECKER_INPUT_INVALID",
      reason: "CLI_ARGUMENT_REJECTED",
    });
  });

  it.each([
    {
      anchor: "baseline",
      file: BASELINE,
      reason: "SCOPE_BASELINE_HASH_MISMATCH",
    },
    {
      anchor: "verifier",
      file: VERIFIER,
      reason: "SCOPE_VERIFIER_HASH_MISMATCH",
    },
  ])(
    "rejects a tampered copied $anchor anchor by literal hash",
    ({ file, reason }) => {
      // Given / When
      const result = runScopeFixture((root) => {
        const target = join(root, file);
        writeFileSync(target, `${readFileSync(target, "utf8")}\n`);
      });
      // Then
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        code: "IMMUTABLE_SCOPE_REJECTED",
        reason,
      });
    },
  );

  it("accepts a copied scope fixture when the exact root cache is absent", () => {
    // Given / When
    const result = runRootCacheFixture([]);
    // Then
    expect(JSON.parse(result.stdout).status, result.stdout.trim()).toBe("pass");
    expect(result.status).toBe(0);
  });

  it("accepts a copied scope fixture when the exact root cache is created", () => {
    // Given / When
    const result = runRootCacheFixture(["created cache bytes"]);
    // Then
    expect(JSON.parse(result.stdout).status, result.stdout.trim()).toBe("pass");
    expect(result.status).toBe(0);
  });

  it("accepts a copied scope fixture when the exact root cache is rewritten", () => {
    // Given / When
    const result = runRootCacheFixture([
      "initial cache bytes",
      "rewritten cache bytes",
    ]);
    // Then
    expect(JSON.parse(result.stdout).status, result.stdout.trim()).toBe("pass");
    expect(result.status).toBe(0);
  });

  it.each(["immutable-fixture/tsconfig.tsbuildinfo", "outside-contract.txt"])(
    "rejects the new immutable path %s",
    (file) => {
      // Given / When
      const result = runScopeFixture((root) => {
        const target = join(root, file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, "fixture");
      });
      // Then
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        code: "IMMUTABLE_SCOPE_REJECTED",
        reason: "FINAL_SCOPE_DRIFT",
      });
    },
  );

  it.each([
    {
      scenario: "missing role",
      file: "DESIGN.md",
      from: '"risk_policy"',
      to: '"missing_role"',
      code: "DESIGN_CONTRACT_INVALID",
      reason: "ROSTER_CONTRACT_INVALID",
    },
    {
      scenario: "duplicate phase boundary",
      file: "DESIGN.md",
      from: '"startTick": 240',
      to: '"startTick": 239',
      code: "DESIGN_CONTRACT_INVALID",
      reason: "BEAT_RANGE_INVALID",
    },
    {
      scenario: "baseline-owned product drift",
      file: "PRODUCT.md",
      from: "\n",
      to: "\nfixture drift\n",
      code: "IMMUTABLE_SCOPE_REJECTED",
      reason: "FINAL_SCOPE_DRIFT",
    },
  ])("rejects $scenario", ({ file, from, to, code, reason }) => {
    // Given / When
    const result = runScopeFixture((root) =>
      replaceFixture(root, file, from, to),
    );
    // Then
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ code, reason });
  });
});

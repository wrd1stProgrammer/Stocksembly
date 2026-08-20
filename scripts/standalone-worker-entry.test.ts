import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const entryScript = join(process.cwd(), "scripts/standalone-worker-entry.mjs");

describe("standalone worker entry", () => {
  it("exits when research admission fails while the briefing worker is still running", async () => {
    const fixtureRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-worker-entry-"),
    );
    const researchWorkerDirectory = join(fixtureRoot, "research-worker");

    try {
      await Promise.all([
        mkdir(researchWorkerDirectory, { recursive: true }),
        mkdir(join(fixtureRoot, "briefing-worker"), { recursive: true }),
        mkdir(join(fixtureRoot, "node_modules/better-sqlite3/build/Release"), {
          recursive: true,
        }),
      ]);
      await Promise.all([
        cp(entryScript, join(researchWorkerDirectory, "worker.mjs")),
        writeFile(join(fixtureRoot, "package.json"), '{"type":"module"}'),
        writeFile(
          join(
            fixtureRoot,
            "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
          ),
          "fixture",
        ),
        writeFile(
          join(researchWorkerDirectory, "leaseWorker.js"),
          `export const runLeaseWorkerProcess = async () => {
  const error = new Error("Codex isolation readiness failed");
  error.code = "CODEX_ISOLATION_FAILED";
  error.check = "probe";
  error.reason = "runner_process";
  throw error;
};\n`,
        ),
        writeFile(
          join(fixtureRoot, "briefing-worker/briefingWorker.js"),
          "export const runBriefingWorkerProcess = () => new Promise(() => {});\n",
        ),
      ]);

      const result = spawnSync(
        process.execPath,
        [join(researchWorkerDirectory, "worker.mjs"), "serve"],
        { encoding: "utf8", timeout: 2_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(1);
      expect(JSON.parse(result.stderr.trim())).toEqual({
        kind: "worker_error",
        code: "CODEX_ISOLATION_FAILED",
        check: "probe",
        reason: "runner_process",
        message: "Codex isolation readiness failed",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});

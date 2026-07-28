import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const runtimeProbeResultSchema = z.object({
  kind: z.literal("runtime_probe_ok"),
  platform: z.literal("darwin"),
  architecture: z.literal("arm64"),
  journalMode: z.literal("wal"),
  foreignKeys: z.literal(1),
  row: z.object({
    id: z.literal("stocksembly-runtime-probe-v1"),
    value: z.literal("native-sqlite-ok"),
  }),
  sandboxExec: z.literal("/usr/bin/sandbox-exec"),
  databaseCleaned: z.literal(true),
});

const runtimeProbeErrorSchema = z.object({
  kind: z.literal("runtime_probe_error"),
  code: z.literal("RUNTIME_PROBE_INVALID_ARGUMENT"),
});

describe("research worker runtime probe", () => {
  it("round-trips one row through temporary WAL SQLite from the real CLI", async () => {
    // Given
    const probeTempRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-runtime-probe-test-"),
    );

    try {
      // When
      const result = spawnSync("pnpm", ["research:worker:probe"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, TMPDIR: probeTempRoot },
      });

      // Then
      expect(result.status, result.stderr).toBe(0);
      const outputLine = z
        .string()
        .parse(result.stdout.trim().split("\n").at(-1));
      const outputValue: unknown = JSON.parse(outputLine);
      expect(runtimeProbeResultSchema.parse(outputValue)).toEqual({
        kind: "runtime_probe_ok",
        platform: "darwin",
        architecture: "arm64",
        journalMode: "wal",
        foreignKeys: 1,
        row: {
          id: "stocksembly-runtime-probe-v1",
          value: "native-sqlite-ok",
        },
        sandboxExec: "/usr/bin/sandbox-exec",
        databaseCleaned: true,
      });
      expect(await readdir(probeTempRoot)).toEqual([]);
    } finally {
      await rm(probeTempRoot, { recursive: true, force: true });
    }
  });

  it("rejects an unknown runtime probe mode with a typed CLI error", () => {
    // Given
    const unknownMode = "unexpected-mode";

    // When
    const result = spawnSync(
      "pnpm",
      ["research:worker:probe", "--", unknownMode],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    // Then
    expect(result.status).toBe(1);
    const outputLine = z
      .string()
      .parse(result.stderr.trim().split("\n").at(-1));
    const outputValue: unknown = JSON.parse(outputLine);
    expect(runtimeProbeErrorSchema.parse(outputValue)).toEqual({
      kind: "runtime_probe_error",
      code: "RUNTIME_PROBE_INVALID_ARGUMENT",
    });
  });
});

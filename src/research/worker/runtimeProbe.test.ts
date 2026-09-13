import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createResearchTestDatabase } from "../../test/researchPostgres";

const runtimeProbeResultSchema = z.object({
  kind: z.literal("runtime_probe_ok"),
  platform: z.literal("darwin"),
  architecture: z.literal("arm64"),
  database: z.literal("postgresql"),
  row: z.object({
    id: z.literal("stocksembly-runtime-probe-v1"),
    value: z.literal("postgresql-ok"),
  }),
  sandboxExec: z.literal("/usr/bin/sandbox-exec"),
  databaseCleaned: z.literal(true),
});

const runtimeProbeErrorSchema = z.object({
  kind: z.literal("runtime_probe_error"),
  code: z.literal("RUNTIME_PROBE_INVALID_ARGUMENT"),
});

describe("research worker runtime probe", () => {
  beforeAll(() => {
    const build = spawnSync("pnpm", ["research:worker:build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(build.status, build.stdout + build.stderr).toBe(0);
  }, 60_000);
  it("round-trips one row through temporary PostgreSQL table from the real CLI", async () => {
    // Given
    const probeTempRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-runtime-probe-test-"),
    );

    const database = await createResearchTestDatabase();
    try {
      // When
      const result = spawnSync(
        process.execPath,
        [
          ".stocksembly-verification/research-worker/runtimeProbe.js",
          "runtime-probe",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            TMPDIR: probeTempRoot,
            STOCKSEMBLY_DATABASE_URL: database.pool.options.connectionString,
            STOCKSEMBLY_DATABASE_SSL: "false",
          },
          timeout: 30_000,
        },
      );

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
        database: "postgresql",
        row: {
          id: "stocksembly-runtime-probe-v1",
          value: "postgresql-ok",
        },
        sandboxExec: "/usr/bin/sandbox-exec",
        databaseCleaned: true,
      });
      expect(await readdir(probeTempRoot)).toEqual([]);
    } finally {
      await database.close();
      await rm(probeTempRoot, { recursive: true, force: true });
    }
  });

  it("rejects an unknown runtime probe mode with a typed CLI error", () => {
    // Given
    const unknownMode = "unexpected-mode";

    // When
    const result = spawnSync(
      process.execPath,
      [
        ".stocksembly-verification/research-worker/runtimeProbe.js",
        "runtime-probe",
        unknownMode,
      ],
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

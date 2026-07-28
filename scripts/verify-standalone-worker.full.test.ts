import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const verifiedFullSchema = z.object({
  kind: z.literal("standalone_worker_full_verified"),
  web: z.object({ status: z.literal("ready"), host: z.literal("127.0.0.1") }),
  worker: z.object({ status: z.literal("ready") }),
  persistence: z.object({
    migrationsApplied: z.number().int().positive(),
    nativeSqlite: z.literal("loaded"),
    cas: z.literal("written"),
    jobExecuted: z.literal(true),
    jobPreserved: z.literal(true),
    artifactPreserved: z.literal(true),
    attempts: z.literal(1),
    committedArtifacts: z.literal(1),
    attemptId: z.string().uuid(),
    artifactId: z.string().uuid(),
  }),
  restarts: z.object({ web: z.literal("ready"), worker: z.literal("ready") }),
  failures: z.object({
    webOnlySuccessRejected: z.literal(true),
    webOnly: z.object({
      httpStatus: z.number().int().min(200).max(499),
      workerStatus: z.number().int().positive(),
      workerCode: z.literal("SQLITE_NATIVE_UNAVAILABLE"),
      combinedReady: z.literal(false),
    }),
  }),
});

describe("standalone worker full lifecycle", () => {
  it("restarts the packaged loopback web and worker without losing durable work", () => {
    // Given
    const verifier = join(
      process.cwd(),
      "scripts/verify-standalone-worker.mjs",
    );

    // When
    const result = spawnSync(process.execPath, [verifier, "--full"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
    });

    // Then
    expect(result.status, result.stderr).toBe(0);
    const line = z.string().parse(result.stdout.trim().split("\n").at(-1));
    const output: unknown = JSON.parse(line);
    expect(verifiedFullSchema.parse(output)).toMatchObject({
      kind: "standalone_worker_full_verified",
      web: { status: "ready", host: "127.0.0.1" },
      worker: { status: "ready" },
      persistence: {
        nativeSqlite: "loaded",
        cas: "written",
        jobExecuted: true,
        jobPreserved: true,
        artifactPreserved: true,
        attempts: 1,
        committedArtifacts: 1,
      },
      restarts: { web: "ready", worker: "ready" },
      failures: {
        webOnlySuccessRejected: true,
        webOnly: {
          workerCode: "SQLITE_NATIVE_UNAVAILABLE",
          combinedReady: false,
        },
      },
    });
  }, 120_000);
});

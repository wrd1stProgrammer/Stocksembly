import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acquireWorkerLease,
  inspectWorkerHealth,
  type WorkerRuntime,
} from "./runtimeLifecycle";

async function fixture(): Promise<WorkerRuntime> {
  const dataDirectory = await realpath(
    await mkdtemp(join(tmpdir(), "worker-lease-")),
  );
  return {
    dataDirectory,
    databasePath: join(dataDirectory, "research.sqlite"),
    migrationsDirectory: "",
    migrationsApplied: 0,
    casDigest: "",
  };
}

describe("worker data-directory lease", () => {
  it("recovers a stale container lock even when its PID has been reused", async () => {
    const runtime = await fixture();
    await writeFile(
      join(runtime.dataDirectory, "worker.lock"),
      JSON.stringify({
        ownerId: `removed-container:${process.pid}`,
        pid: process.pid,
        nonce: randomUUID(),
      }),
    );
    try {
      const lease = await acquireWorkerLease(runtime);
      await lease.release();
    } finally {
      await rm(runtime.dataDirectory, { recursive: true, force: true });
    }
  });
  it("denies a real active process and reacquires its lease after SIGKILL", async () => {
    const runtime = await fixture();
    const child = spawn(
      process.execPath,
      [
        "-e",
        `
      const Database = require(process.argv[1]);
      const database = new Database(process.argv[2], { timeout: 0 });
      database.exec("BEGIN IMMEDIATE");
      process.send("locked");
      setInterval(() => {}, 1000);
    `,
        createRequire(import.meta.url).resolve("better-sqlite3"),
        join(runtime.dataDirectory, "worker-lease.sqlite"),
      ],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    try {
      await once(child, "message");
      await expect(acquireWorkerLease(runtime)).rejects.toMatchObject({
        code: "WORKER_LEASE_OCCUPIED",
      });
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      const lease = await acquireWorkerLease(runtime);
      await expect(acquireWorkerLease(runtime)).rejects.toMatchObject({
        code: "WORKER_LEASE_OCCUPIED",
      });
      await lease.release();
      await lease.release();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      await rm(runtime.dataDirectory, { recursive: true, force: true });
    }
  });
  it("health checks require a held OS lease rather than a living recycled PID", async () => {
    const runtime = await fixture();
    vi.stubEnv("STOCKSEMBLY_DATA_DIR", runtime.dataDirectory);
    try {
      await writeFile(
        join(runtime.dataDirectory, "worker.lock"),
        JSON.stringify({
          ownerId: `removed:${process.pid}`,
          pid: process.pid,
          nonce: randomUUID(),
        }),
      );
      await expect(inspectWorkerHealth()).rejects.toMatchObject({
        code: "WORKER_NOT_RUNNING",
      });
      const lease = await acquireWorkerLease(runtime);
      try {
        await expect(inspectWorkerHealth()).resolves.toMatchObject({
          dataDirectory: runtime.dataDirectory,
        });
      } finally {
        await lease.release();
      }
      await expect(inspectWorkerHealth()).rejects.toMatchObject({
        code: "WORKER_NOT_RUNNING",
      });
    } finally {
      vi.unstubAllEnvs();
      await rm(runtime.dataDirectory, { recursive: true, force: true });
    }
  });
});

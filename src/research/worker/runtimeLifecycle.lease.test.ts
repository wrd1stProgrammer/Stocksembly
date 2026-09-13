import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import * as pools from "../server/persistence/postgres/researchPool";
import {
  acquireWorkerLease,
  inspectWorkerHealth,
  type WorkerRuntime,
} from "./runtimeLifecycle";

async function fixture() {
  const database = await createResearchTestDatabase();
  const dataDirectory = await realpath(
    await mkdtemp(join(tmpdir(), "worker-lease-")),
  );
  const runtime: WorkerRuntime = {
    dataDirectory,
    database: database.pool,
    migrationsApplied: 0,
    casDigest: "",
  };
  return {
    runtime,
    close: async () => {
      await database.close();
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

describe("worker PostgreSQL session lease", () => {
  it("ignores a stale container marker even when its PID has been reused", async () => {
    const { runtime, close } = await fixture();
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
      await close();
    }
  });
  it("denies a real active process and reacquires its lease after SIGKILL", async () => {
    const { runtime, close } = await fixture();
    const child = spawn(
      process.execPath,
      [
        "-e",
        `
      const { Client } = require(process.argv[1]);
      const client = new Client({connectionString:process.env.STOCKSEMBLY_DATABASE_URL});
      (async () => { await client.connect(); await client.query('SELECT pg_advisory_lock(73921401)'); process.send('locked'); })().catch(error => { console.error(error); process.exit(1); });
    `,
        createRequire(import.meta.url).resolve("pg"),
      ],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: {
          ...process.env,
          STOCKSEMBLY_DATABASE_URL: runtime.database.options.connectionString,
        },
      },
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
      await close();
    }
  });
  it("health requires a held database lease rather than a recycled PID", async () => {
    const { runtime, close } = await fixture();
    vi.stubEnv("STOCKSEMBLY_DATA_DIR", runtime.dataDirectory);
    vi.spyOn(pools, "getResearchPool").mockResolvedValue(runtime.database);
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
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await close();
    }
  });
});

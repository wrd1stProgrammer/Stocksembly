import { execFile } from "node:child_process";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { z } from "zod";
import { createBlsAdapter, type MacroHttpTransport } from "./bls";
import { BLS_TEST_NOW, blsPayload, createBlsTestRoot } from "./bls.testSupport";

const execFileAsync = promisify(execFile);
const PersistedStateSchema = z.object({
  budget: z.record(z.string(), z.number().int()),
  cache: z.record(z.string(), z.unknown()),
});

async function runRaceWorker(options: {
  readonly dataRoot: string;
  readonly workerId: string;
  readonly offset: number;
}): Promise<void> {
  await execFileAsync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "src/research/server/data/macro/blsProcess.worker.test.ts",
      "--maxWorkers=1",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BLS_RACE_ROOT: options.dataRoot,
        BLS_RACE_WORKER: options.workerId,
        BLS_RACE_OFFSET: String(options.offset),
      },
      timeout: 20_000,
    },
  );
}

export function registerBlsPersistenceTestCases(): void {
  it("atomically preserves the 25/day budget and cache across two racing processes", async () => {
    // Given
    const dataRoot = await createBlsTestRoot();

    // When
    await Promise.all([
      runRaceWorker({ dataRoot, workerId: "a", offset: 0 }),
      runRaceWorker({ dataRoot, workerId: "b", offset: 13 }),
    ]);
    const calls = await readdir(join(dataRoot, "calls"));
    const rawState = await readFile(
      join(dataRoot, "macro", "bls-state.json"),
      "utf8",
    );
    const state = PersistedStateSchema.parse(JSON.parse(rawState));
    const macroEntries = await readdir(join(dataRoot, "macro"));
    const statePath = join(dataRoot, "macro", "bls-state.json");
    const stateMetadata = await lstat(statePath);
    const directoryMetadata = await stat(join(dataRoot, "macro"));

    // Then
    expect(calls).toHaveLength(25);
    expect(state.budget["2026-07-22"]).toBe(25);
    expect(Object.keys(state.cache)).toHaveLength(25);
    expect(macroEntries).toEqual(["bls-state.json"]);
    expect(stateMetadata.isSymbolicLink()).toBe(false);
    expect(stateMetadata.mode & 0o777).toBe(0o600);
    expect(directoryMetadata.mode & 0o777).toBe(0o700);
  }, 30_000);

  it("persists the 25 per UTC day budget while cache hits consume no request", async () => {
    // Given
    const dataRoot = await createBlsTestRoot();
    let calls = 0;
    const transport: MacroHttpTransport = async (request) => {
      calls += 1;
      const match = /"startyear":"(\d{4})"/.exec(request.body ?? "");
      return {
        status: 200,
        headers: {},
        body: blsPayload("CUUR0000SA0", "321.500", match?.[1] ?? "2026"),
      };
    };
    const options = {
      dataRoot,
      transport,
      clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
    };
    const adapter = createBlsAdapter(options);
    for (let index = 0; index < 25; index += 1) {
      const year = 2000 + index;
      await adapter.collect({
        seriesId: "CUUR0000SA0",
        startYear: year,
        endYear: year,
      });
    }

    // When
    const cached = await createBlsAdapter(options).collect({
      seriesId: "CUUR0000SA0",
      startYear: 2000,
      endYear: 2000,
    });
    const exhausted = await createBlsAdapter(options).collect({
      seriesId: "LNS14000000",
      startYear: 2026,
      endYear: 2026,
    });

    // Then
    expect(cached.status).toBe("available");
    expect(exhausted).toMatchObject({
      status: "degraded",
      reason: "daily_budget_exhausted",
    });
    expect(calls).toBe(25);
  });

  it("bounds transient retries to three attempts", async () => {
    // Given
    let attempts = 0;
    const delays: number[] = [];
    const adapter = createBlsAdapter({
      dataRoot: await createBlsTestRoot(),
      transport: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("timeout");
        return { status: 200, headers: {}, body: blsPayload() };
      },
      clock: {
        isoNow: () => BLS_TEST_NOW,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    });

    // When
    const result = await adapter.collect({
      seriesId: "CUUR0000SA0",
      startYear: 2026,
      endYear: 2026,
    });

    // Then
    expect(result.status).toBe("available");
    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 500]);
  });
}

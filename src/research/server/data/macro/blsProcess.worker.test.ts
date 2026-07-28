import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createBlsAdapter } from "./bls";
import { BLS_TEST_NOW, blsPayload } from "./bls.testSupport";

async function waitForPeers(dataRoot: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const entries = await readdir(dataRoot);
    if (entries.filter((entry) => entry.startsWith("ready-")).length === 2)
      return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("BLS race worker peer did not become ready");
}

it("issues thirteen distinct uncached requests from one race process", async () => {
  // Given
  const {
    BLS_RACE_ROOT: dataRoot,
    BLS_RACE_WORKER: workerId,
    BLS_RACE_OFFSET: rawOffset,
  } = process.env;
  const offset = Number(rawOffset);
  expect(dataRoot).toBeTypeOf("string");
  expect(workerId).toBeTypeOf("string");
  expect(Number.isInteger(offset)).toBe(true);
  if (dataRoot === undefined || workerId === undefined) return;
  await mkdir(join(dataRoot, "calls"), { recursive: true });
  await writeFile(join(dataRoot, `ready-${workerId}`), "", { flag: "wx" });
  await waitForPeers(dataRoot);
  const adapter = createBlsAdapter({
    dataRoot,
    transport: async (request) => {
      const match = /"startyear":"(\d{4})"/.exec(request.body ?? "");
      const year = match?.[1] ?? "unknown";
      await writeFile(join(dataRoot, "calls", year), "", { flag: "wx" });
      return {
        status: 200,
        headers: {},
        body: blsPayload("CUUR0000SA0", "321.500", year),
      };
    },
    clock: { isoNow: () => BLS_TEST_NOW, sleep: async () => undefined },
  });

  // When
  const results = await Promise.all(
    Array.from({ length: 13 }, (_, index) => {
      const year = 2000 + offset + index;
      return adapter.collect({
        seriesId: "CUUR0000SA0",
        startYear: year,
        endYear: year,
      });
    }),
  );

  // Then
  expect(results).toHaveLength(13);
});

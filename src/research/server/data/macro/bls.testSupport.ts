import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];

export const BLS_TEST_NOW = "2026-07-22T04:05:06.000Z";

export async function createBlsTestRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "stocksembly-bls-"));
  roots.push(path);
  return path;
}

export function blsPayload(
  seriesId = "CUUR0000SA0",
  value = "321.500",
  year = "2026",
): string {
  return JSON.stringify({
    status: "REQUEST_SUCCEEDED",
    message: [],
    Results: {
      series: [
        {
          seriesID: seriesId,
          data: [
            {
              year,
              period: "M06",
              periodName: "June",
              value,
              footnotes:
                value === "-"
                  ? [{ code: "-", text: "Data not available" }]
                  : [{}],
            },
          ],
        },
      ],
    },
  });
}

export async function cleanupBlsTestRoots(): Promise<void> {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true })),
  );
}

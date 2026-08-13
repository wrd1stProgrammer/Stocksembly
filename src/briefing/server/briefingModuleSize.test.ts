import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES = [
  "briefingDataCollector.ts",
  "briefingCollectorClients.ts",
  "briefingCollectorNews.ts",
  "briefingCollectorMarket.ts",
  "briefingCollectorFinancials.ts",
  "briefingDataCollector.characterization.test.ts",
  "briefingModuleSize.test.ts",
] as const;

function pureLines(source: string): number {
  let inBlockComment = false;
  return source.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return false;
    }
    if (trimmed.startsWith("/*")) {
      inBlockComment = !trimmed.includes("*/");
      return false;
    }
    return trimmed.length > 0 && !trimmed.startsWith("//");
  }).length;
}

describe("briefing module size", () => {
  it("keeps plan-owned modules below 250 pure lines", () => {
    const directory = resolve(process.cwd(), "src/briefing/server");
    const counts = Object.fromEntries(
      MODULES.map((name) => {
        const path = `${directory}/${name}`;
        return [
          name,
          existsSync(path) ? pureLines(readFileSync(path, "utf8")) : "missing",
        ];
      }),
    );
    expect(counts).toEqual(
      Object.fromEntries(
        Object.entries(counts).filter(
          ([, count]) => typeof count === "number" && count <= 250,
        ),
      ),
    );
  });
});

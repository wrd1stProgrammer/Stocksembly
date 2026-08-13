import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const PackageScriptsSchema = z.object({
  scripts: z.record(z.string(), z.string()),
});

describe("local briefing preview launcher", () => {
  it("pins the locale required by the Codex host policy", async () => {
    const packageValue: unknown = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    );
    const script =
      PackageScriptsSchema.parse(packageValue).scripts[
        "briefing:preview:generate"
      ];

    expect(script).toContain(
      "LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 NODE_ENV=development node",
    );
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const PackageManifestSchema = z.object({
  scripts: z.object({
    start: z.string(),
    preview: z.string(),
    "start:local": z.string(),
  }),
});

describe("local research runtime", () => {
  it("starts the web server and research worker from the preview command", () => {
    // Given
    const manifest = PackageManifestSchema.parse(
      JSON.parse(readFileSync(resolve("package.json"), "utf8")),
    );

    // When
    const startCommand = manifest.scripts.start;
    const previewCommand = manifest.scripts.preview;
    const localStartCommand = manifest.scripts["start:local"];

    // Then
    expect(startCommand).toBe("pnpm start:local");
    expect(previewCommand).toBe("PORT=4175 pnpm start:local");
    expect(localStartCommand).toBe("node scripts/start-local.mjs");
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadInsightSentryConfig } from "./insightSentryConfig";

const PackageScriptsSchema = z.object({
  scripts: z.object({
    start: z.string(),
    "start:web": z.string(),
    "start:worker": z.string(),
  }),
});

async function loadPackageScripts(): Promise<
  z.infer<typeof PackageScriptsSchema>["scripts"]
> {
  const contents = await readFile(resolve("package.json"), "utf8");
  const decoded: unknown = JSON.parse(contents);
  return PackageScriptsSchema.parse(decoded).scripts;
}

describe("InsightSentry startup configuration", () => {
  it("launches the standalone web server entry", async () => {
    // Given
    const scripts = await loadPackageScripts();

    // When
    const command = scripts.start;

    // Then
    expect(command).toMatch(
      /node (?:--env-file-if-exists=\S+ )?\.next\/standalone\/server\.js$/,
    );
  });

  it("loads the optional root environment file for standalone processes", async () => {
    // Given
    const scripts = await loadPackageScripts();

    // When
    const standaloneCommands = [
      scripts.start,
      scripts["start:web"],
      scripts["start:worker"],
    ];

    // Then
    expect(standaloneCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("--env-file-if-exists=.env.local"),
      ]),
    );
    expect(
      standaloneCommands.every((command) =>
        command.includes("--env-file-if-exists=.env.local"),
      ),
    ).toBe(true);
  });

  it("reports not_configured when the key is absent", () => {
    // Given
    const environment = {
      INSIGHTSENTRY_RAPIDAPI_HOST: "insightsentry.p.rapidapi.com",
    };

    // When
    const result = loadInsightSentryConfig(environment);

    // Then
    expect(result).toEqual({
      status: "not_configured",
      reason: "missing_key",
    });
  });

  it("rejects malformed and unexpected provider hosts", () => {
    // Given
    const malformedEnvironments = [
      {
        INSIGHTSENTRY_RAPIDAPI_KEY: "test-key",
        INSIGHTSENTRY_RAPIDAPI_HOST: "https://insightsentry.p.rapidapi.com",
      },
      {
        INSIGHTSENTRY_RAPIDAPI_KEY: "test-key",
        INSIGHTSENTRY_RAPIDAPI_HOST: "stale.example.invalid",
      },
    ];

    // When
    const results = malformedEnvironments.map(loadInsightSentryConfig);

    // Then
    expect(results).toEqual([
      { status: "not_configured", reason: "invalid_host" },
      { status: "not_configured", reason: "invalid_host" },
    ]);
  });

  it("keeps configured credentials out of serialized state", () => {
    // Given
    const key = ["test", "private", "credential"].join("-");

    // When
    const result = loadInsightSentryConfig({
      INSIGHTSENTRY_RAPIDAPI_KEY: key,
      INSIGHTSENTRY_RAPIDAPI_HOST: "insightsentry.p.rapidapi.com",
    });

    // Then
    expect(result.status).toBe("available");
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("x-rapidapi-key");
  });
});

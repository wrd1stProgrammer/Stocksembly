import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const PackageScriptsSchema = z.object({
  scripts: z.record(z.string(), z.string()),
});

describe("standalone worker public launchers", () => {
  it("pins the Codex locale for web and worker launchers", async () => {
    // Given
    const packagePath = join(process.cwd(), "package.json");

    // When
    const packageValue: unknown = JSON.parse(
      await readFile(packagePath, "utf8"),
    );
    const scripts = PackageScriptsSchema.parse(packageValue).scripts;

    // Then
    expect({
      start: scripts.start,
      web: scripts["start:web"],
      worker: scripts["start:worker"],
    }).toEqual({
      start:
        "LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 HOSTNAME=127.0.0.1 node .next/standalone/server.js",
      web: "LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 HOSTNAME=127.0.0.1 node .next/standalone/server.js",
      worker:
        "LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node .next/standalone/research-worker/worker.mjs serve",
    });
  });

  it("routes every worker launcher through the protective entry", async () => {
    // Given
    const packagePath = join(process.cwd(), "package.json");

    // When
    const packageValue: unknown = JSON.parse(
      await readFile(packagePath, "utf8"),
    );
    const scripts = PackageScriptsSchema.parse(packageValue).scripts;

    // Then
    expect({
      research: scripts["research:worker"],
      researchStart: scripts["research:worker:start"],
      serve: scripts["start:worker"],
      readiness: scripts["research:worker:readiness"],
      health: scripts["research:worker:health"],
    }).toEqual({
      research: "pnpm build && pnpm start:worker",
      researchStart: "pnpm start:worker",
      serve:
        "LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node .next/standalone/research-worker/worker.mjs serve",
      readiness: "node .next/standalone/research-worker/worker.mjs readiness",
      health: "node .next/standalone/research-worker/worker.mjs health",
    });
  });
});

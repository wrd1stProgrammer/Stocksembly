import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const prepareScript = join(process.cwd(), "scripts/prepare-standalone.mjs");
const verifierScript = join(
  process.cwd(),
  "scripts/verify-standalone-worker.mjs",
);

const verifiedProbeSchema = z.object({
  kind: z.literal("standalone_worker_verified"),
  probe: z.object({
    kind: z.literal("runtime_probe_ok"),
    journalMode: z.literal("wal"),
    foreignKeys: z.literal(1),
    row: z.object({
      id: z.literal("stocksembly-runtime-probe-v1"),
      value: z.literal("native-sqlite-ok"),
    }),
    sandboxExec: z.literal("/usr/bin/sandbox-exec"),
    databaseCleaned: z.literal(true),
  }),
});

const standaloneErrorSchema = z.object({
  kind: z.literal("standalone_worker_error"),
  code: z.string().min(1),
});

beforeAll(() => {
  const buildResult = spawnSync("pnpm", ["research:worker:build"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(buildResult.status, buildResult.stderr).toBe(0);
});

const createPrepareFixture = async (): Promise<string> => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "stocksembly-standalone-test-"),
  );
  await Promise.all([
    mkdir(join(fixtureRoot, ".next/standalone"), { recursive: true }),
    mkdir(join(fixtureRoot, ".next/static"), { recursive: true }),
    mkdir(join(fixtureRoot, "public"), { recursive: true }),
    mkdir(join(fixtureRoot, ".stocksembly-verification/research-worker"), {
      recursive: true,
    }),
    mkdir(join(fixtureRoot, "node_modules"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(fixtureRoot, ".next/static/fixture.txt"), "static"),
    writeFile(
      join(fixtureRoot, ".next/standalone/package.json"),
      '{"type":"module"}',
    ),
    writeFile(join(fixtureRoot, "public/fixture.txt"), "public"),
    cp(
      join(
        process.cwd(),
        ".stocksembly-verification/research-worker/runtimeProbe.js",
      ),
      join(
        fixtureRoot,
        ".stocksembly-verification/research-worker/runtimeProbe.js",
      ),
    ),
    symlink(
      join(process.cwd(), "node_modules/better-sqlite3"),
      join(fixtureRoot, "node_modules/better-sqlite3"),
      "dir",
    ),
    symlink(
      join(process.cwd(), "node_modules/zod"),
      join(fixtureRoot, "node_modules/zod"),
      "dir",
    ),
  ]);
  return fixtureRoot;
};

const prepareFixture = (fixtureRoot: string) =>
  spawnSync(process.execPath, [prepareScript], {
    cwd: fixtureRoot,
    encoding: "utf8",
  });

describe("standalone worker packaging", () => {
  it("packages the compiled worker and migration directory when preparing standalone", async () => {
    // Given
    const fixtureRoot = await createPrepareFixture();

    try {
      // When
      const result = prepareFixture(fixtureRoot);

      // Then
      expect(result.status, result.stderr).toBe(0);
      const [workerFile, migrationsDirectory] = await Promise.all([
        stat(
          join(fixtureRoot, ".next/standalone/research-worker/runtimeProbe.js"),
        ),
        stat(join(fixtureRoot, ".next/standalone/migrations")),
      ]);
      expect([workerFile.isFile(), migrationsDirectory.isDirectory()]).toEqual([
        true,
        true,
      ]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("packages the native SQLite binding and its runtime dependencies", async () => {
    // Given
    const fixtureRoot = await createPrepareFixture();

    try {
      // When
      const result = prepareFixture(fixtureRoot);

      // Then
      expect(result.status, result.stderr).toBe(0);
      const nativeArtifacts = await Promise.all(
        [
          "better-sqlite3/build/Release/better_sqlite3.node",
          "bindings/package.json",
          "file-uri-to-path/package.json",
          "zod/package.json",
        ].map((artifactPath) =>
          stat(
            join(fixtureRoot, ".next/standalone/node_modules", artifactPath),
          ),
        ),
      );
      expect(nativeArtifacts.map((artifact) => artifact.isFile())).toEqual([
        true,
        true,
        true,
        true,
      ]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("runs the packaged native worker probe from an explicit standalone root", async () => {
    // Given
    const fixtureRoot = await createPrepareFixture();

    try {
      expect(await realpath(fixtureRoot)).not.toBe(fixtureRoot);
      const prepareResult = prepareFixture(fixtureRoot);
      expect(prepareResult.status, prepareResult.stderr).toBe(0);

      // When
      const result = spawnSync(
        process.execPath,
        [
          verifierScript,
          "--probe",
          "--package-root",
          join(fixtureRoot, ".next/standalone"),
        ],
        { cwd: fixtureRoot, encoding: "utf8" },
      );

      // Then
      expect(result.status, result.stderr).toBe(0);
      const outputLine = z
        .string()
        .parse(result.stdout.trim().split("\n").at(-1));
      const outputValue: unknown = JSON.parse(outputLine);
      expect(verifiedProbeSchema.parse(outputValue)).toMatchObject({
        kind: "standalone_worker_verified",
        probe: {
          kind: "runtime_probe_ok",
          journalMode: "wal",
          foreignKeys: 1,
          row: {
            id: "stocksembly-runtime-probe-v1",
            value: "native-sqlite-ok",
          },
          sandboxExec: "/usr/bin/sandbox-exec",
          databaseCleaned: true,
        },
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("rejects a copied package when only its native SQLite binding is removed", async () => {
    // Given
    const fixtureRoot = await createPrepareFixture();

    try {
      const prepareResult = prepareFixture(fixtureRoot);
      expect(prepareResult.status, prepareResult.stderr).toBe(0);
      const packageRoot = join(fixtureRoot, ".next/standalone");
      await rm(
        join(
          packageRoot,
          "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
        ),
      );

      // When
      const result = spawnSync(
        process.execPath,
        [verifierScript, "--probe", "--package-root", packageRoot],
        { cwd: fixtureRoot, encoding: "utf8" },
      );

      // Then
      expect(result.status).toBe(1);
      const outputLine = z
        .string()
        .parse(result.stderr.trim().split("\n").at(-1));
      const outputValue: unknown = JSON.parse(outputLine);
      expect(standaloneErrorSchema.parse(outputValue)).toMatchObject({
        kind: "standalone_worker_error",
        code: "SQLITE_NATIVE_UNAVAILABLE",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("rejects a missing explicit package root with a typed package error", async () => {
    // Given
    const fixtureRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-missing-package-test-"),
    );

    try {
      // When
      const result = spawnSync(
        process.execPath,
        [
          verifierScript,
          "--probe",
          "--package-root",
          join(fixtureRoot, "missing"),
        ],
        { cwd: fixtureRoot, encoding: "utf8" },
      );

      // Then
      expect(result.status).toBe(1);
      const outputLine = z
        .string()
        .parse(result.stderr.trim().split("\n").at(-1));
      const outputValue: unknown = JSON.parse(outputLine);
      expect(standaloneErrorSchema.parse(outputValue)).toMatchObject({
        kind: "standalone_worker_error",
        code: "STANDALONE_PACKAGE_INVALID",
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});

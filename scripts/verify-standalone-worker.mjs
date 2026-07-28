import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { verifyStandaloneFull } from "./verify-standalone-worker-full.mjs";

const argumentsSchema = z.union([
  z
    .tuple([z.literal("--probe")])
    .transform(() => ({ mode: "probe", packageRoot: undefined })),
  z
    .tuple([
      z.literal("--probe"),
      z.literal("--package-root"),
      z.string().min(1),
    ])
    .transform((values) => ({ mode: "probe", packageRoot: values[2] })),
  z
    .tuple([z.literal("--full")])
    .transform(() => ({ mode: "full", packageRoot: undefined })),
  z
    .tuple([
      z.literal("--full"),
      z.literal("--package-root"),
      z.string().min(1),
    ])
    .transform((values) => ({ mode: "full", packageRoot: values[2] })),
]);

const probeResultSchema = z
  .object({
    kind: z.literal("runtime_probe_ok"),
    platform: z.literal("darwin"),
    architecture: z.string().min(1),
    journalMode: z.literal("wal"),
    foreignKeys: z.literal(1),
    row: z.object({
      id: z.literal("stocksembly-runtime-probe-v1"),
      value: z.literal("native-sqlite-ok"),
    }),
    sandboxExec: z.literal("/usr/bin/sandbox-exec"),
    databaseCleaned: z.literal(true),
  })
  .strict();

const probeErrorSchema = z.object({
  kind: z.literal("runtime_probe_error"),
  code: z.string().min(1),
  message: z.string().min(1),
});

class StandaloneVerificationError extends Error {
  name = "StandaloneVerificationError";

  constructor(code, message, options) {
    super(message, options);
    this.code = code;
  }
}

const parseLastJsonLine = (output, schema) => {
  const line = z.string().min(1).parse(output.trim().split("\n").at(-1));
  const value = JSON.parse(line);
  return schema.parse(value);
};

const verifyPackageRoot = async (packageRoot) => {
  const workerPath = join(packageRoot, "research-worker/runtimeProbe.js");
  const migrationsPath = join(packageRoot, "migrations");
  const nativeBindingPath = join(
    packageRoot,
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  );

  try {
    const [workerFile, migrationsDirectory] = await Promise.all([
      stat(workerPath),
      stat(migrationsPath),
    ]);
    if (!workerFile.isFile() || !migrationsDirectory.isDirectory()) {
      throw new StandaloneVerificationError(
        "STANDALONE_PACKAGE_INVALID",
        "The standalone worker or migrations contract is invalid",
      );
    }
  } catch (error) {
    if (error instanceof StandaloneVerificationError) {
      throw error;
    }
    throw new StandaloneVerificationError(
      "STANDALONE_PACKAGE_INVALID",
      "The standalone worker package is incomplete",
      { cause: error },
    );
  }

  try {
    const nativeBinding = await stat(nativeBindingPath);
    if (!nativeBinding.isFile()) {
      throw new StandaloneVerificationError(
        "SQLITE_NATIVE_UNAVAILABLE",
        "The packaged better-sqlite3 native binding is unavailable",
      );
    }
  } catch (error) {
    if (error instanceof StandaloneVerificationError) {
      throw error;
    }
    throw new StandaloneVerificationError(
      "SQLITE_NATIVE_UNAVAILABLE",
      "The packaged better-sqlite3 native binding is unavailable",
      { cause: error },
    );
  }

  const probeProcess = spawnSync(
    process.execPath,
    [workerPath, "runtime-probe"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1_048_576,
    },
  );
  if (probeProcess.status !== 0) {
    let workerError;
    try {
      workerError = parseLastJsonLine(probeProcess.stderr, probeErrorSchema);
    } catch (error) {
      throw new StandaloneVerificationError(
        "STANDALONE_WORKER_PROBE_FAILED",
        "The packaged worker probe exited without a typed error",
        { cause: error },
      );
    }
    throw new StandaloneVerificationError(
      workerError.code,
      workerError.message,
    );
  }

  let probe;
  try {
    probe = parseLastJsonLine(probeProcess.stdout, probeResultSchema);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issuePaths = error.issues
        .map((issue) => issue.path.join("."))
        .join(",");
      throw new StandaloneVerificationError(
        "STANDALONE_WORKER_OUTPUT_INVALID",
        `The packaged worker output failed schema validation at ${issuePaths}`,
        { cause: error },
      );
    }
    throw error;
  }
  return { kind: "standalone_worker_verified", probe };
};

const main = async () => {
  try {
    const argumentsResult = argumentsSchema.safeParse(process.argv.slice(2));
    if (!argumentsResult.success) {
      throw new StandaloneVerificationError(
        "STANDALONE_WORKER_INVALID_ARGUMENT",
        "Expected --probe with an optional --package-root path",
      );
    }

    const requestedRoot = argumentsResult.data.packageRoot;
    const resolvedRoot =
      requestedRoot === undefined
        ? resolve(".next/standalone")
        : isAbsolute(requestedRoot)
          ? requestedRoot
          : resolve(requestedRoot);
    if (argumentsResult.data.mode === "full") {
      const result = await verifyStandaloneFull(resolvedRoot);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (requestedRoot !== undefined) {
      const result = await verifyPackageRoot(resolvedRoot);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }

    const verificationRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-standalone-verify-"),
    );
    try {
      const packageRoot = join(verificationRoot, "standalone");
      await cp(resolve(".next/standalone"), packageRoot, {
        recursive: true,
        force: true,
        dereference: true,
      });
      const result = await verifyPackageRoot(packageRoot);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
      await rm(verificationRoot, { recursive: true, force: true });
    }
  } catch (error) {
    const failure =
      error instanceof StandaloneVerificationError
        ? error
        : error instanceof Error &&
            "code" in error &&
            typeof error.code === "string"
          ? new StandaloneVerificationError(error.code, error.message, {
              cause: error,
            })
          : new StandaloneVerificationError(
              "STANDALONE_WORKER_VERIFICATION_FAILED",
              error instanceof Error
                ? error.message
                : "Standalone worker verification failed",
              { cause: error },
            );
    process.stderr.write(
      `${JSON.stringify({ kind: "standalone_worker_error", code: failure.code, message: failure.message })}\n`,
    );
    process.exitCode = 1;
  }
};

await main();

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { z } from "zod";

const SANDBOX_EXEC_PATH = "/usr/bin/sandbox-exec" as const;
const PROBE_ROW = {
  id: "stocksembly-runtime-probe-v1",
  value: "native-sqlite-ok",
} as const;

const runtimeProbeArgumentsSchema = z.tuple([z.literal("runtime-probe")]);
const journalModeSchema = z.literal("wal");
const foreignKeysSchema = z.literal(1);
const probeRowsSchema = z.tuple([
  z.object({
    id: z.literal(PROBE_ROW.id),
    value: z.literal(PROBE_ROW.value),
  }),
]);

const RUNTIME_PROBE_ERROR_CODES = [
  "RUNTIME_PROBE_INVALID_ARGUMENT",
  "RUNTIME_PLATFORM_UNSUPPORTED",
  "SANDBOX_EXEC_UNAVAILABLE",
  "SQLITE_NATIVE_UNAVAILABLE",
  "SQLITE_CONFIGURATION_INVALID",
  "SQLITE_ROW_MISMATCH",
  "RUNTIME_PROBE_FAILED",
] as const;

type RuntimeProbeErrorCode = (typeof RUNTIME_PROBE_ERROR_CODES)[number];

type RuntimeProbeResult = {
  readonly kind: "runtime_probe_ok";
  readonly platform: "darwin" | "linux";
  readonly architecture: string;
  readonly journalMode: "wal";
  readonly foreignKeys: 1;
  readonly row: typeof PROBE_ROW;
  readonly sandboxExec: typeof SANDBOX_EXEC_PATH | null;
  readonly databaseCleaned: true;
};

export class RuntimeProbeError extends Error {
  readonly name = "RuntimeProbeError";

  constructor(
    readonly code: RuntimeProbeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const runRuntimeProbe = async (): Promise<RuntimeProbeResult> => {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new RuntimeProbeError(
      "RUNTIME_PLATFORM_UNSUPPORTED",
      "The research runtime probe requires Darwin or Linux",
    );
  }

  if (process.platform === "darwin") {
    try {
      const sandboxExecutable = await stat(SANDBOX_EXEC_PATH);
      if (!sandboxExecutable.isFile()) {
        throw new RuntimeProbeError(
          "SANDBOX_EXEC_UNAVAILABLE",
          "The mandatory sandbox-exec path is not a regular file",
        );
      }
      await access(SANDBOX_EXEC_PATH, constants.X_OK);
    } catch (error) {
      if (error instanceof RuntimeProbeError) {
        throw error;
      }
      throw new RuntimeProbeError(
        "SANDBOX_EXEC_UNAVAILABLE",
        "The mandatory sandbox-exec executable is unavailable",
        { cause: error },
      );
    }

    const sandboxResult = spawnSync(
      SANDBOX_EXEC_PATH,
      ["-p", "(version 1) (allow default)", "--", "/usr/bin/true"],
      { stdio: "ignore" },
    );
    if (sandboxResult.error !== undefined || sandboxResult.status !== 0) {
      throw new RuntimeProbeError(
        "SANDBOX_EXEC_UNAVAILABLE",
        "The mandatory sandbox-exec executable failed its validation probe",
        sandboxResult.error === undefined
          ? undefined
          : { cause: sandboxResult.error },
      );
    }
  }

  const probeDirectory = await mkdtemp(
    join(tmpdir(), "stocksembly-runtime-probe-"),
  );
  let database: Database.Database | undefined;
  try {
    try {
      database = new Database(join(probeDirectory, "runtime-probe.sqlite"));
    } catch (error) {
      throw new RuntimeProbeError(
        "SQLITE_NATIVE_UNAVAILABLE",
        "The better-sqlite3 native binding could not be loaded",
        { cause: error },
      );
    }

    const journalModeResult = journalModeSchema.safeParse(
      database.pragma("journal_mode = WAL", { simple: true }),
    );
    database.pragma("foreign_keys = ON");
    const foreignKeysResult = foreignKeysSchema.safeParse(
      database.pragma("foreign_keys", { simple: true }),
    );
    if (!journalModeResult.success || !foreignKeysResult.success) {
      throw new RuntimeProbeError(
        "SQLITE_CONFIGURATION_INVALID",
        "SQLite did not enable the mandatory WAL and foreign-key pragmas",
      );
    }

    database.exec(
      "CREATE TABLE runtime_probe (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT",
    );
    database
      .prepare("INSERT INTO runtime_probe (id, value) VALUES (?, ?)")
      .run(PROBE_ROW.id, PROBE_ROW.value);
    const rowsResult = probeRowsSchema.safeParse(
      database.prepare("SELECT id, value FROM runtime_probe ORDER BY id").all(),
    );
    if (!rowsResult.success) {
      throw new RuntimeProbeError(
        "SQLITE_ROW_MISMATCH",
        "SQLite did not round-trip the exact runtime probe row",
      );
    }

    return {
      kind: "runtime_probe_ok",
      platform: process.platform,
      architecture: process.arch,
      journalMode: journalModeResult.data,
      foreignKeys: foreignKeysResult.data,
      row: rowsResult.data[0],
      sandboxExec:
        process.platform === "darwin" ? SANDBOX_EXEC_PATH : null,
      databaseCleaned: true,
    };
  } finally {
    try {
      if (database?.open === true) {
        database.close();
      }
    } finally {
      await rm(probeDirectory, { recursive: true, force: true });
    }
  }
};

const main = async (): Promise<void> => {
  try {
    const argumentsResult = runtimeProbeArgumentsSchema.safeParse(
      process.argv.slice(2),
    );
    if (!argumentsResult.success) {
      throw new RuntimeProbeError(
        "RUNTIME_PROBE_INVALID_ARGUMENT",
        "Expected the single runtime-probe command",
      );
    }
    const result = await runRuntimeProbe();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const failure =
      error instanceof RuntimeProbeError
        ? error
        : new RuntimeProbeError(
            "RUNTIME_PROBE_FAILED",
            "The runtime probe failed",
            {
              cause: error,
            },
          );
    process.stderr.write(
      `${JSON.stringify({ kind: "runtime_probe_error", code: failure.code, message: failure.message })}\n`,
    );
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(await realpath(entryPath)).href
) {
  void main();
}

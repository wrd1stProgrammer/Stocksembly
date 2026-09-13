import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { z } from "zod";
import {
  closeResearchPool,
  getResearchPool,
} from "../server/persistence/postgres/researchPool";

const SANDBOX_EXEC_PATH = "/usr/bin/sandbox-exec" as const;
const PROBE_ROW = {
  id: "stocksembly-runtime-probe-v1",
  value: "postgresql-ok",
} as const;

const runtimeProbeArgumentsSchema = z.tuple([z.literal("runtime-probe")]);
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
  "POSTGRESQL_UNAVAILABLE",
  "POSTGRESQL_ROW_MISMATCH",
  "RUNTIME_PROBE_FAILED",
] as const;

type RuntimeProbeErrorCode = (typeof RUNTIME_PROBE_ERROR_CODES)[number];

type RuntimeProbeResult = {
  readonly kind: "runtime_probe_ok";
  readonly platform: "darwin" | "linux";
  readonly architecture: string;
  readonly database: "postgresql";
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

export const runRuntimeProbe = async (
  pool?: Pool,
): Promise<RuntimeProbeResult> => {
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

  const database = pool ?? (await getResearchPool());
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TEMP TABLE runtime_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL) ON COMMIT DROP",
    );
    await client.query(
      "INSERT INTO runtime_probe (id, value) VALUES ($1, $2)",
      [PROBE_ROW.id, PROBE_ROW.value],
    );
    const rows = await client.query(
      "SELECT id, value FROM runtime_probe ORDER BY id",
    );
    const result = probeRowsSchema.safeParse(rows.rows);
    if (!result.success)
      throw new RuntimeProbeError(
        "POSTGRESQL_ROW_MISMATCH",
        "PostgreSQL did not round-trip the exact runtime probe row",
      );
    await client.query("ROLLBACK");
    return {
      kind: "runtime_probe_ok",
      platform: process.platform,
      architecture: process.arch,
      database: "postgresql",
      row: result.data[0],
      sandboxExec: process.platform === "darwin" ? SANDBOX_EXEC_PATH : null,
      databaseCleaned: true,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
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
  } finally {
    await closeResearchPool();
  }
};

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(await realpath(entryPath)).href
) {
  void main();
}

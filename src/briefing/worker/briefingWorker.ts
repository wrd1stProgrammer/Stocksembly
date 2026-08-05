import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createLiveAccountStore } from "../../accounts/server/postgresAccountStore";
import {
  prepareArtifactPaths,
  resolveStocksemblyDataDirectory,
} from "../../research/server/artifacts/filesystemArtifactPaths";
import { createBriefingScheduler } from "../server/briefingScheduler";

const ArgumentsSchema = z.union([
  z.tuple([z.literal("serve")]),
  z.tuple([z.literal("health")]),
  z.tuple([z.literal("run"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)]),
]);

function write(value: Readonly<Record<string, unknown>>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function waitForStop(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

export async function runBriefingWorkerProcess(
  values: readonly string[],
): Promise<void> {
  const parsed = ArgumentsSchema.safeParse(
    values[0] === "--" ? values.slice(1) : values,
  );
  if (!parsed.success) throw new TypeError("Invalid briefing worker arguments");
  const [command, marketDate] = parsed.data;
  const paths = await prepareArtifactPaths(resolveStocksemblyDataDirectory());
  const store = await createLiveAccountStore();
  if (store === undefined) {
    write({
      kind: "briefing_worker",
      status: "disabled",
      reason: "account_store_unavailable",
    });
    if (command === "serve") {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      await waitForStop(controller.signal);
    }
    return;
  }
  try {
    const scheduler = createBriefingScheduler({ store, dataRoot: paths.root });
    if (scheduler === undefined)
      throw new TypeError("Briefing store capabilities are unavailable");
    if (command === "health") {
      write({ kind: "briefing_worker_health", status: "ready" });
      return;
    }
    if (command === "run") {
      const result = await scheduler.runForMarketDate(marketDate);
      write({ kind: "briefing_manual_cycle", ...result });
      return;
    }
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    write({ kind: "briefing_worker", status: "ready" });
    try {
      await scheduler.runUntilStopped(controller.signal);
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } finally {
    await store.close();
  }
}

async function main() {
  try {
    await runBriefingWorkerProcess(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        kind: "briefing_worker_error",
        message: error instanceof Error ? error.message : "unknown",
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  import.meta.url ===
  pathToFileURL(join(process.cwd(), process.argv[1] ?? "")).href
)
  await main();

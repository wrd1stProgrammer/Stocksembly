import { statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  prepareArtifactPaths,
  resolveStocksemblyDataDirectory,
} from "../artifacts/filesystemArtifactPaths";
import { CodexIsolationError } from "../codex/readiness";
import { runProductionCodexReadinessProbe } from "../codex/readinessProbe";
import { getLiveTickerCatalog } from "./liveTickerCatalog";
import { createResearchApi, type ResearchApi } from "./researchApi";
import { loadPublicResearchReport } from "./researchApiReportReader";

let instance: Promise<ResearchApi> | undefined;

export async function prepareLiveResearchRuntime() {
  const paths = await prepareArtifactPaths(resolveStocksemblyDataDirectory());
  return {
    paths,
    dataRoot: paths.root,
    databasePath: join(paths.root, "research.sqlite"),
  } as const;
}

export async function createLiveResearchApi(): Promise<ResearchApi> {
  const {
    PORT: configuredPort,
    STOCKSEMBLY_PUBLIC_ORIGIN: configuredPublicOrigin,
  } = process.env;
  const runtime = await prepareLiveResearchRuntime();
  const { paths } = runtime;
  const port = configuredPort ?? "3000";
  const publicOrigin = new URL(
    configuredPublicOrigin ?? `http://127.0.0.1:${port}`,
  );
  if (
    publicOrigin.origin !== publicOrigin.href.replace(/\/$/u, "") ||
    (publicOrigin.protocol !== "http:" && publicOrigin.protocol !== "https:")
  )
    throw new Error("STOCKSEMBLY_PUBLIC_ORIGIN_INVALID");
  const tickerCatalog = await getLiveTickerCatalog();
  return await createResearchApi({
    dataRoot: paths.root,
    databasePath: runtime.databasePath,
    allowedHost: publicOrigin.host,
    allowedOrigin: publicOrigin.origin,
    readiness: async () => {
      try {
        await runProductionCodexReadinessProbe("worker_admission");
        return true;
      } catch (error) {
        if (error instanceof CodexIsolationError) return false;
        throw error;
      }
    },
    availableDiskBytes: async () => {
      const status = await statfs(paths.root);
      return status.bavail * status.bsize;
    },
    loadReport: async (publication) =>
      await loadPublicResearchReport({ dataRoot: paths.root }, publication),
    resolveSymbol: tickerCatalog.resolve,
  });
}

export function getLiveResearchApi(): Promise<ResearchApi> {
  instance ??= createLiveResearchApi();
  return instance;
}

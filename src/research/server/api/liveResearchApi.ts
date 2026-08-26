import { statfs } from "node:fs/promises";
import { join } from "node:path";
import { createLiveAccountStore } from "../../../accounts/server/postgresAccountStore";
import {
  prepareArtifactPaths,
  resolveStocksemblyDataDirectory,
} from "../artifacts/filesystemArtifactPaths";
import { createLiveS3ArtifactArchive } from "../artifacts/s3ArtifactArchive";
import { createLiveResearchQueue } from "../queue/sqsResearchQueue";
import { getLiveTickerCatalog } from "./liveTickerCatalog";
import { createResearchApi, type ResearchApi } from "./researchApi";
import { loadPublicResearchReport } from "./researchApiReportReader";

let instance: Promise<ResearchApi> | undefined;

export function researchDispatchIsReady(
  loopback: boolean,
  queueConfigured: boolean,
): boolean {
  return loopback || queueConfigured;
}

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
    STOCKSEMBLY_COGNITO_USER_POOL_ID: cognitoUserPoolId,
    STOCKSEMBLY_COGNITO_CLIENT_ID: cognitoClientId,
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
  const accountStore = await createLiveAccountStore();
  const researchQueue = createLiveResearchQueue();
  const artifactArchive = createLiveS3ArtifactArchive();
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    publicOrigin.hostname,
  );
  const billingRequired = accountStore !== undefined || !loopback;
  return await createResearchApi({
    dataRoot: paths.root,
    databasePath: runtime.databasePath,
    billingRequired,
    allowedHost: publicOrigin.host,
    allowedOrigin: publicOrigin.origin,
    // The worker owns Codex admission and re-checks readiness before launches.
    // The web request only needs a dispatch path; running a model probe here can
    // outlive the browser timeout after the run has already been accepted.
    readiness: async () =>
      researchDispatchIsReady(loopback, researchQueue !== undefined),
    availableDiskBytes: async () => {
      const status = await statfs(paths.root);
      return status.bavail * status.bsize;
    },
    loadReport: async (publication) =>
      await loadPublicResearchReport(
        {
          dataRoot: paths.root,
          ...(artifactArchive === undefined
            ? {}
            : { remoteArtifacts: artifactArchive }),
        },
        publication,
      ),
    resolveSymbol: tickerCatalog.resolve,
    ...(accountStore === undefined ? {} : { accountStore }),
    ...(researchQueue === undefined ? {} : { researchQueue }),
    ...(cognitoUserPoolId && cognitoClientId
      ? {
          cognito: {
            userPoolId: cognitoUserPoolId,
            clientId: cognitoClientId,
            secureCookie: publicOrigin.protocol === "https:",
          },
        }
      : {}),
  });
}

export function getLiveResearchApi(): Promise<ResearchApi> {
  instance ??= createLiveResearchApi();
  return instance;
}

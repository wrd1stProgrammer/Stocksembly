import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResearchApi } from "../../../src/research/server/api/researchApi";
import { createResearchApi } from "../../../src/research/server/api/researchApi";
import { loadPublicResearchReport } from "../../../src/research/server/api/researchApiReportReader";

export type ApiHarness = {
  readonly root: string;
  readonly databasePath: string;
  readonly allowedHost: string;
  readonly allowedOrigin: string;
  readonly api: ResearchApi;
  readonly cookie: string;
  readonly request: (
    path: string,
    init?: RequestInit,
    authenticate?: boolean,
  ) => Request;
  readonly close: () => Promise<void>;
};

export async function createApiHarness(
  readiness: () => Promise<boolean> = () => Promise.resolve(true),
  availableDiskBytes: () => Promise<number> = () =>
    Promise.resolve(3 * 1024 * 1024 * 1024),
): Promise<ApiHarness> {
  const root = await mkdtemp(join(tmpdir(), "stocksembly-research-api-"));
  const allowedHost = "127.0.0.1:3000";
  const allowedOrigin = `http://${allowedHost}`;
  const databasePath = join(root, "research.sqlite");
  const supportedSymbols = new Set([
    "NVDA",
    "AAPL",
    "MSFT",
    "TSLA",
    "AMZN",
    "META",
    "AMD",
    "BRK-B",
  ]);
  const api = await createResearchApi({
    dataRoot: root,
    databasePath,
    allowedHost,
    allowedOrigin,
    readiness,
    availableDiskBytes,
    now: () => "2026-07-23T06:00:00.000Z",
    createId: randomUUID,
    resolveSymbol: (symbol) =>
      Promise.resolve(
        symbol === "SPY"
          ? "etf"
          : symbol === "BRK"
            ? "ambiguous"
            : supportedSymbols.has(symbol)
              ? "supported"
              : "unsupported",
      ),
    loadReport: async (publication) =>
      await loadPublicResearchReport({ dataRoot: root }, publication),
  });
  const cookie = (await api.bootstrapSession()).split(";", 1)[0] ?? "";
  return {
    root,
    databasePath,
    allowedHost,
    allowedOrigin,
    api,
    cookie,
    request(path, init = {}, authenticate = true) {
      const headers = new Headers(init.headers);
      headers.set("host", allowedHost);
      headers.set("sec-fetch-site", "same-origin");
      if (authenticate) headers.set("cookie", cookie);
      return new Request(`${allowedOrigin}${path}`, { ...init, headers });
    },
    close: async () => {
      await api.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function createRunRequest(
  harness: ApiHarness,
  key: string,
  body: Readonly<Record<string, string>> = {
    symbol: "NVDA",
    question: "What changed in margins?",
    locale: "en",
  },
): Request {
  return harness.request("/api/research/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      origin: harness.allowedOrigin,
    },
    body: JSON.stringify(body),
  });
}

export async function json(response: Response): Promise<unknown> {
  return await response.json();
}

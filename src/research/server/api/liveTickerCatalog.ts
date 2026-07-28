import { join } from "node:path";
import {
  prepareArtifactPaths,
  resolveStocksemblyDataDirectory,
} from "../artifacts/filesystemArtifactPaths";
import { createInsightSentryClient } from "../data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../data/insightsentry/insightSentryConfig";
import {
  createInsightSentryMarket,
  type InsightSentryMarket,
  type InsightSentrySymbol,
} from "../data/insightsentry/insightSentryMarket";
import {
  openSymbolRegistry,
  type SymbolRegistryResolution,
} from "../data/insightsentry/symbolRegistry";
import {
  isExplicitlyUnsupportedEtf,
  resolveTickerReference,
  searchTickerReference,
  type TickerReferenceSearchItem,
} from "../data/sec/issuerResolverReference";
import { createSecClient } from "../data/sec/secClient";

export type LiveTickerCatalog = {
  readonly search: (query: string) => Promise<readonly InsightSentrySymbol[]>;
  readonly resolve: (
    symbol: string,
  ) => Promise<
    "supported" | "unsupported" | "etf" | "ambiguous" | "unavailable"
  >;
  readonly lookup: (symbol: string) => SymbolRegistryResolution;
  readonly close: () => void;
};

type LiveTickerCatalogOptions = {
  readonly databasePath: string;
  readonly market: Pick<InsightSentryMarket, "searchSymbols">;
  readonly searchReference: (
    query: string,
  ) => Promise<readonly TickerReferenceSearchItem[]>;
  readonly resolveReference: (
    symbol: string,
  ) => Promise<"supported" | "unsupported" | "ambiguous" | "unavailable">;
  readonly now?: () => string;
};

function fromReference(item: TickerReferenceSearchItem): InsightSentrySymbol {
  return Object.freeze({
    symbol: item.symbol,
    providerCode: `${item.exchange}:${item.symbol}`,
    company: item.company,
    exchange: item.exchange,
    securityType: "common_stock",
    currency: "USD",
    status: "active",
    aliases: Object.freeze([item.symbol, `${item.exchange}:${item.symbol}`]),
  });
}

function resolutionStatus(
  resolution: SymbolRegistryResolution,
): "supported" | "unsupported" | "ambiguous" | undefined {
  switch (resolution.kind) {
    case "resolved":
      return "supported";
    case "ambiguous":
      return "ambiguous";
    case "unsupported":
      return "unsupported";
    case "missing":
      return undefined;
  }
}

function unambiguous(
  values: readonly InsightSentrySymbol[],
): readonly InsightSentrySymbol[] {
  const counts = new Map<string, number>();
  for (const value of values)
    counts.set(value.symbol, (counts.get(value.symbol) ?? 0) + 1);
  return values.filter((value) => counts.get(value.symbol) === 1);
}

function hasDescriptiveCompany(value: InsightSentrySymbol): boolean {
  return value.company.trim().toUpperCase() !== value.symbol.toUpperCase();
}

function mergeSymbol(
  current: InsightSentrySymbol | undefined,
  incoming: InsightSentrySymbol,
): InsightSentrySymbol {
  if (current === undefined || hasDescriptiveCompany(incoming)) return incoming;
  if (!hasDescriptiveCompany(current)) return incoming;
  return Object.freeze({ ...incoming, company: current.company });
}

function relevance(query: string, value: InsightSentrySymbol): number {
  const normalized = query.trim().toUpperCase();
  const symbol = value.symbol.toUpperCase();
  const company = value.company.toUpperCase();
  if (symbol === normalized) return 0;
  if (symbol.startsWith(normalized)) return 1;
  if (company.startsWith(normalized)) return 2;
  if (company.includes(normalized)) return 3;
  return 4;
}

export function createLiveTickerCatalog(
  options: LiveTickerCatalogOptions,
): LiveTickerCatalog {
  const registry = openSymbolRegistry(options.databasePath);
  const now = options.now ?? (() => new Date().toISOString());

  function persist(values: readonly InsightSentrySymbol[]): void {
    for (const value of values) registry.upsert(value, now());
  }

  async function providerSymbols(
    query: string,
  ): Promise<readonly InsightSentrySymbol[]> {
    try {
      return await options.market.searchSymbols(query);
    } catch (error) {
      if (error instanceof Error) return [];
      throw error;
    }
  }

  async function referenceSymbols(
    query: string,
  ): Promise<readonly TickerReferenceSearchItem[]> {
    try {
      return await options.searchReference(query);
    } catch (error) {
      if (error instanceof Error) return [];
      throw error;
    }
  }

  return Object.freeze({
    search: async (query) => {
      const local = registry.search(query);
      const [provider, reference] = await Promise.all([
        providerSymbols(query),
        referenceSymbols(query),
      ]);
      const merged = new Map<string, InsightSentrySymbol>();
      for (const value of local) merged.set(value.providerCode, value);
      for (const value of reference.map(fromReference))
        merged.set(
          value.providerCode,
          mergeSymbol(merged.get(value.providerCode), value),
        );
      for (const value of provider)
        merged.set(
          value.providerCode,
          mergeSymbol(merged.get(value.providerCode), value),
        );
      const values = Object.freeze([...merged.values()]);
      persist(values);
      return [...unambiguous(
        [...merged.values()].filter((item) => item.status === "active"),
      )].sort(
        (left, right) =>
          relevance(query, left) - relevance(query, right) ||
          left.symbol.localeCompare(right.symbol),
      );
    },
    resolve: async (symbol) => {
      const normalized = symbol.trim().toUpperCase();
      if (isExplicitlyUnsupportedEtf(normalized)) return "etf";
      const known = resolutionStatus(registry.resolve(normalized));
      if (known !== undefined) return known;
      const provider = await providerSymbols(normalized);
      persist(provider);
      const refreshed = resolutionStatus(registry.resolve(normalized));
      if (refreshed !== undefined) return refreshed;
      return await options.resolveReference(normalized);
    },
    lookup: (symbol) => registry.resolve(symbol),
    close: () => registry.close(),
  });
}

let instance: Promise<LiveTickerCatalog> | undefined;

async function createProductionCatalog(): Promise<LiveTickerCatalog> {
  const paths = await prepareArtifactPaths(resolveStocksemblyDataDirectory());
  const client = createSecClient({ dataRoot: paths.root });
  const insightSentryClient = createInsightSentryClient({
    configuration: loadInsightSentryConfig(),
    dataRoot: paths.root,
  });
  let catalogBytes: Promise<Uint8Array> | undefined;
  const load = (): Promise<Uint8Array> => {
    catalogBytes ??= client
      .fetch({ kind: "company_tickers_exchange" })
      .then((result) => result.bytes);
    return catalogBytes.catch((error: unknown) => {
      catalogBytes = undefined;
      throw error;
    });
  };
  return createLiveTickerCatalog({
    databasePath: join(paths.root, "research.sqlite"),
    market: createInsightSentryMarket(insightSentryClient),
    searchReference: async (query) =>
      searchTickerReference(await load(), query),
    resolveReference: async (symbol) => {
      try {
        const resolution = resolveTickerReference(await load(), symbol);
        if (resolution.kind === "resolved") return "supported";
        if (resolution.reason === "ambiguous_ticker") return "ambiguous";
        return "unsupported";
      } catch (error) {
        if (error instanceof Error) return "unavailable";
        throw error;
      }
    },
  });
}

export function getLiveTickerCatalog(): Promise<LiveTickerCatalog> {
  instance ??= createProductionCatalog();
  return instance;
}

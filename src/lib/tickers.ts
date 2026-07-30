import ky from "ky";
import { z } from "zod";

export type Ticker = {
  readonly symbol: string;
  readonly providerCode?: string;
  readonly company: string;
  readonly exchange: "NASDAQ" | "NYSE" | "NYSE_AMERICAN";
  readonly sector: string;
};

export type ResearchQuote = {
  readonly lastPrice: number;
  readonly currency: string;
  readonly observedAt: string;
  readonly marketState: "OPEN" | "CLOSED" | "PRE" | "POST" | "HOLIDAYS";
  readonly change?: number;
  readonly changePercent?: number;
};

export const tickers: readonly Ticker[] = [
  {
    symbol: "NVDA",
    company: "NVIDIA Corporation",
    exchange: "NASDAQ",
    sector: "Semiconductors",
  },
  {
    symbol: "AAPL",
    company: "Apple Inc.",
    exchange: "NASDAQ",
    sector: "Consumer Technology",
  },
  {
    symbol: "MSFT",
    company: "Microsoft Corporation",
    exchange: "NASDAQ",
    sector: "Software",
  },
  {
    symbol: "TSLA",
    company: "Tesla, Inc.",
    exchange: "NASDAQ",
    sector: "Automotive",
  },
  {
    symbol: "AMZN",
    company: "Amazon.com, Inc.",
    exchange: "NASDAQ",
    sector: "Commerce & Cloud",
  },
] as const;

export const popularTickers = ["NVDA", "AAPL", "MSFT", "TSLA"] as const;

const TickerSearchResponseSchema = z
  .object({
    tickers: z.array(
      z
        .object({
          symbol: z.string().min(1).max(12),
          providerCode: z.string().min(3).max(64).optional(),
          company: z.string().min(1),
          exchange: z.enum(["NASDAQ", "NYSE", "NYSE_AMERICAN"]),
        })
        .strict(),
    ),
  })
  .strict();
const ResearchQuoteResponseSchema = z
  .object({
    quote: z
      .object({
        lastPrice: z.number().positive(),
        currency: z.string().min(3).max(8),
        observedAt: z.string().datetime(),
        marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
        change: z.number().finite().optional(),
        changePercent: z.number().finite().optional(),
      })
      .strict(),
  })
  .strict();

export function filterTickers(query: string): readonly Ticker[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) return [];

  return tickers.filter(({ symbol, company }) => {
    const searchable = `${symbol} ${company}`.toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function findTicker(symbol: string): Ticker | undefined {
  const normalizedSymbol = symbol.trim().toLocaleUpperCase();
  return tickers.find((ticker) => ticker.symbol === normalizedSymbol);
}

export async function searchUsTickers(
  query: string,
  signal: AbortSignal,
): Promise<readonly Ticker[]> {
  const response: unknown = await ky
    .get("/api/research/tickers", {
      searchParams: { q: query },
      signal,
      retry: 1,
      timeout: 15_000,
    })
    .json();
  return TickerSearchResponseSchema.parse(response).tickers.map((ticker) => ({
    symbol: ticker.symbol,
    company: ticker.company,
    exchange: ticker.exchange,
    ...(ticker.providerCode === undefined
      ? {}
      : { providerCode: ticker.providerCode }),
    sector: "SEC listed company",
  }));
}

export async function fetchResearchQuote(
  symbol: string,
  signal: AbortSignal,
): Promise<ResearchQuote> {
  const response: unknown = await ky
    .get("/api/research/tickers/quote", {
      searchParams: { symbol },
      signal,
      retry: 1,
      timeout: 15_000,
    })
    .json();
  const quote = ResearchQuoteResponseSchema.parse(response).quote;
  return {
    lastPrice: quote.lastPrice,
    currency: quote.currency,
    observedAt: quote.observedAt,
    marketState: quote.marketState,
    ...(quote.change === undefined ? {} : { change: quote.change }),
    ...(quote.changePercent === undefined
      ? {}
      : { changePercent: quote.changePercent }),
  };
}

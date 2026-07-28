import { z } from "zod";

const BarSchema = z.object({
  t: z.iso.datetime({ offset: true }),
  o: z.number().finite(),
  h: z.number().finite(),
  l: z.number().finite(),
  c: z.number().finite(),
  v: z.number().finite().nonnegative(),
  n: z.number().int().nonnegative().optional(),
  vw: z.number().finite().optional(),
});
const ResponseSchema = z.object({
  bars: z.array(BarSchema),
  symbol: z.string(),
  next_page_token: z.string().nullable().optional(),
});

export type MarketBar = z.infer<typeof BarSchema>;
export type MarketHttpTransport = (request: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}) => Promise<{ readonly status: number; readonly body: string }>;

export type MarketTechnicalSnapshot = {
  readonly latestClose: number;
  readonly barDate: string;
  readonly barCount: number;
  readonly sma20?: number;
  readonly sma50?: number;
  readonly sma200?: number;
  readonly rsi14?: number;
  readonly macd?: number;
  readonly macdSignal?: number;
  readonly atr14?: number;
  readonly bollingerUpper?: number;
  readonly bollingerLower?: number;
  readonly volumeRatio20?: number;
  readonly return21d?: number;
  readonly return63d?: number;
  readonly return126d?: number;
  readonly return252d?: number;
  readonly distanceFrom52WeekHigh?: number;
  readonly distanceFrom52WeekLow?: number;
};

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | undefined, digits = 4): number | undefined {
  return value === undefined ? undefined : Number(value.toFixed(digits));
}

function ema(values: readonly number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const multiplier = 2 / (period + 1);
  let result = average(values.slice(0, period));
  if (result === undefined) return undefined;
  for (const value of values.slice(period))
    result = (value - result) * multiplier + result;
  return result;
}

function rsi(closes: readonly number[], period: number): number | undefined {
  if (closes.length <= period) return undefined;
  let gains = 0;
  let losses = 0;
  const changes = closes
    .slice(1)
    .map((value, index) => value - (closes[index] ?? value));
  for (const change of changes.slice(0, period)) {
    gains += Math.max(0, change);
    losses += Math.max(0, -change);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (const change of changes.slice(period)) {
    averageGain = (averageGain * (period - 1) + Math.max(0, change)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(0, -change)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function deriveTechnicalSnapshot(
  bars: readonly MarketBar[],
): MarketTechnicalSnapshot {
  if (bars.length === 0) throw new TypeError("market_bars_empty");
  const sorted = [...bars].sort((left, right) => left.t.localeCompare(right.t));
  const closes = sorted.map((bar) => bar.c);
  const volumes = sorted.map((bar) => bar.v);
  const latest = sorted.at(-1);
  if (latest === undefined) throw new TypeError("market_bars_empty");
  const sma = (period: number) => average(closes.slice(-period));
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd =
    ema12 === undefined || ema26 === undefined ? undefined : ema12 - ema26;
  const macdSeries =
    closes.length < 26
      ? []
      : closes.slice(25).flatMap((_value, index) => {
          const subset = closes.slice(0, index + 26);
          const short = ema(subset, 12);
          const long = ema(subset, 26);
          return short === undefined || long === undefined
            ? []
            : [short - long];
        });
  const typical = closes.slice(-20);
  const middle = average(typical);
  const deviation =
    middle === undefined || typical.length < 20
      ? undefined
      : Math.sqrt(
          typical.reduce((sum, value) => sum + (value - middle) ** 2, 0) /
            typical.length,
        );
  const trueRanges = sorted.slice(1).map((bar, index) => {
    const previousClose = sorted[index]?.c ?? bar.c;
    return Math.max(
      bar.h - bar.l,
      Math.abs(bar.h - previousClose),
      Math.abs(bar.l - previousClose),
    );
  });
  const returnFor = (sessions: number) => {
    const prior = closes.at(-(sessions + 1));
    return prior === undefined ? undefined : latest.c / prior - 1;
  };
  const oneYear = sorted.slice(-252);
  const high52 =
    oneYear.length === 0 ? undefined : Math.max(...oneYear.map((bar) => bar.h));
  const low52 =
    oneYear.length === 0 ? undefined : Math.min(...oneYear.map((bar) => bar.l));
  const averageVolume20 = average(volumes.slice(-20));
  const optional = <T>(key: string, value: T | undefined) =>
    value === undefined ? {} : { [key]: value };
  return {
    latestClose: latest.c,
    barDate: latest.t.slice(0, 10),
    barCount: sorted.length,
    ...optional("sma20", round(sma(20))),
    ...optional("sma50", round(sma(50))),
    ...optional("sma200", round(sma(200))),
    ...optional("rsi14", round(rsi(closes, 14), 2)),
    ...optional("macd", round(macd)),
    ...optional("macdSignal", round(ema(macdSeries, 9))),
    ...optional("atr14", round(average(trueRanges.slice(-14)))),
    ...optional(
      "bollingerUpper",
      round(
        middle === undefined || deviation === undefined
          ? undefined
          : middle + 2 * deviation,
      ),
    ),
    ...optional(
      "bollingerLower",
      round(
        middle === undefined || deviation === undefined
          ? undefined
          : middle - 2 * deviation,
      ),
    ),
    ...optional(
      "volumeRatio20",
      round(
        averageVolume20 === undefined || averageVolume20 === 0
          ? undefined
          : latest.v / averageVolume20,
        2,
      ),
    ),
    ...optional("return21d", round(returnFor(21))),
    ...optional("return63d", round(returnFor(63))),
    ...optional("return126d", round(returnFor(126))),
    ...optional("return252d", round(returnFor(252))),
    ...optional(
      "distanceFrom52WeekHigh",
      round(high52 === undefined ? undefined : latest.c / high52 - 1),
    ),
    ...optional(
      "distanceFrom52WeekLow",
      round(low52 === undefined ? undefined : latest.c / low52 - 1),
    ),
  };
}

export async function collectAlpacaDailyBars(input: {
  readonly symbol: string;
  readonly apiKeyId?: string;
  readonly apiSecretKey?: string;
  readonly transport: MarketHttpTransport;
  readonly now?: Date;
}) {
  if (!input.apiKeyId || !input.apiSecretKey)
    return {
      status: "unavailable" as const,
      reason: "not_configured" as const,
    };
  const end = new Date((input.now ?? new Date()).getTime() - 16 * 60_000);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const params = new URLSearchParams({
    timeframe: "1Day",
    start: start.toISOString(),
    end: end.toISOString(),
    adjustment: "all",
    feed: "sip",
    limit: "1000",
    sort: "asc",
  });
  const sourceUrl = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(input.symbol.toUpperCase())}/bars?${params}`;
  const response = await input.transport({
    url: sourceUrl,
    headers: {
      "APCA-API-KEY-ID": input.apiKeyId,
      "APCA-API-SECRET-KEY": input.apiSecretKey,
      Accept: "application/json",
    },
  });
  if (response.status !== 200)
    return {
      status: "unavailable" as const,
      reason: "provider_failure" as const,
      providerStatus: response.status,
    };
  const parsed = ResponseSchema.safeParse(JSON.parse(response.body));
  if (!parsed.success || parsed.data.bars.length < 200)
    return {
      status: "unavailable" as const,
      reason: "insufficient_history" as const,
    };
  return {
    status: "available" as const,
    sourceUrl,
    retrievedAt: (input.now ?? new Date()).toISOString(),
    bars: parsed.data.bars,
    technical: deriveTechnicalSnapshot(parsed.data.bars),
  };
}

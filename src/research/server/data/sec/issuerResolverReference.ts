import { z } from "zod";

const TickerReferenceSchema = z
  .object({
    fields: z.tuple([
      z.literal("cik"),
      z.literal("name"),
      z.literal("ticker"),
      z.literal("exchange"),
    ]),
    data: z.array(
      z.tuple([
        z.number().int().nonnegative().max(9_999_999_999),
        z.string().trim().min(1),
        z.string().trim().min(1),
        z.string().nullable(),
      ]),
    ),
  })
  .strict();

export type ResolverExchange = "NASDAQ" | "NYSE" | "NYSE_AMERICAN";
export type TickerReferenceSearchItem = {
  readonly cik: string;
  readonly symbol: string;
  readonly company: string;
  readonly exchange: ResolverExchange;
};
export type TickerReferenceResolution =
  | {
      readonly kind: "resolved";
      readonly cik: string;
      readonly exchange: ResolverExchange;
      readonly sourceExchange: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "ticker_not_found"
        | "ambiguous_ticker"
        | "unsupported_exchange"
        | "otc"
        | "malformed_source";
    };

function normalizeExchange(
  value: string,
): ResolverExchange | "OTC" | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === "OTC" || normalized.startsWith("OTC ")) return "OTC";
  if (normalized === "NASDAQ" || normalized.startsWith("NASDAQ "))
    return "NASDAQ";
  if (normalized === "NYSE") return "NYSE";
  if (normalized === "NYSE AMERICAN" || normalized === "NYSE MKT")
    return "NYSE_AMERICAN";
  return undefined;
}

const unsupportedEtfs = new Set(["SPY", "QQQ", "VOO", "VTI", "DIA", "IWM"]);

function parseTickerReference(bytes: Uint8Array) {
  try {
    return TickerReferenceSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    ).data;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      return undefined;
    throw error;
  }
}

export function isExplicitlyUnsupportedEtf(symbol: string): boolean {
  return unsupportedEtfs.has(symbol.trim().toUpperCase());
}

export function searchTickerReference(
  bytes: Uint8Array,
  query: string,
  limit = 12,
): readonly TickerReferenceSearchItem[] {
  const reference = parseTickerReference(bytes);
  const normalized = query.trim().toLowerCase();
  if (reference === undefined || normalized.length === 0 || limit < 1)
    return [];
  return reference.data
    .flatMap((row) => {
      const exchange = row[3] === null ? undefined : normalizeExchange(row[3]);
      const symbol = row[2].toUpperCase();
      if (
        exchange === undefined ||
        exchange === "OTC" ||
        isExplicitlyUnsupportedEtf(symbol)
      )
        return [];
      const company = row[1];
      const lowerSymbol = symbol.toLowerCase();
      const lowerCompany = company.toLowerCase();
      const rank =
        lowerSymbol === normalized
          ? 0
          : lowerSymbol.startsWith(normalized)
            ? 1
            : lowerCompany.startsWith(normalized)
              ? 2
              : lowerSymbol.includes(normalized)
                ? 3
                : lowerCompany.includes(normalized)
                  ? 4
                  : undefined;
      return rank === undefined
        ? []
        : [
            {
              rank,
              item: {
                cik: String(row[0]).padStart(10, "0"),
                symbol,
                company,
                exchange,
              },
            },
          ];
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.item.symbol.localeCompare(right.item.symbol),
    )
    .slice(0, Math.min(limit, 20))
    .map(({ item }) => item);
}

export function resolveTickerReference(
  bytes: Uint8Array,
  ticker: string,
): TickerReferenceResolution {
  const reference = parseTickerReference(bytes);
  if (reference === undefined)
    return { kind: "rejected", reason: "malformed_source" };
  const matches = reference.data.filter((row) => row[2] === ticker);
  if (matches.length === 0)
    return { kind: "rejected", reason: "ticker_not_found" };
  const unique = matches.filter(
    (row, index) =>
      matches.findIndex(
        (candidate) => candidate[0] === row[0] && candidate[3] === row[3],
      ) === index,
  );
  if (unique.length !== 1)
    return { kind: "rejected", reason: "ambiguous_ticker" };
  const row = unique[0];
  if (row === undefined)
    return { kind: "rejected", reason: "malformed_source" };
  if (row[3] === null)
    return { kind: "rejected", reason: "unsupported_exchange" };
  const exchange = normalizeExchange(row[3]);
  if (exchange === "OTC") return { kind: "rejected", reason: "otc" };
  if (exchange === undefined)
    return { kind: "rejected", reason: "unsupported_exchange" };
  return {
    kind: "resolved",
    cik: String(row[0]).padStart(10, "0"),
    exchange,
    sourceExchange: row[3],
  };
}

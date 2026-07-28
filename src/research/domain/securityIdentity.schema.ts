import { z } from "zod";
import { CikSchema, TickerSymbolSchema } from "./ids";

const CikInputSchema = z
  .union([z.string(), z.number().int().nonnegative()])
  .transform((value) => String(value))
  .pipe(CikSchema);
const TickerRowSchema = z
  .object({
    symbol: TickerSymbolSchema,
    cik: CikInputSchema,
    exchange: z.string().trim().min(1),
  })
  .strict();
const FilingSourceSchema = z
  .object({ form: z.string().trim().min(1), cik: CikInputSchema })
  .strict();
const CoverPageSchema = z
  .object({
    form: z.string().trim().min(1),
    tradingSymbol: TickerSymbolSchema,
    cik: CikInputSchema,
    securityExchangeName: z.string().trim().min(1),
    security12bTitle: z.string().trim().min(1),
  })
  .strict();
export const IdentityInputSchema = z
  .object({
    submittedSymbol: TickerSymbolSchema,
    tickerExchangeRows: z.array(TickerRowSchema).max(100),
    filingForms: z.array(FilingSourceSchema).max(500),
    coverPages: z.array(CoverPageSchema).max(100),
  })
  .strict();

export const FPI_FORMS = new Set("20-F 40-F 6-K".split(" "));
export const INVESTMENT_FORMS = new Set(
  "N-1A N-2 N-CSR N-CSRS N-Q NPORT-P NPORT-EX 485APOS 485BPOS".split(" "),
);
export const DOMESTIC_FORMS = new Set(
  "10-K 10-K/A 10-Q 10-Q/A 8-K 8-K/A".split(" "),
);
export const REQUIRED_DOMESTIC_FORMS = ["10-K", "10-Q", "8-K"] as const;
export const EXCHANGE_ALIASES: ReadonlyMap<
  string,
  "NASDAQ" | "NYSE" | "NYSE_AMERICAN"
> = new Map([
  ["NASDAQ", "NASDAQ"],
  ["NASDAQ GLOBAL SELECT MARKET", "NASDAQ"],
  ["NYSE", "NYSE"],
  ["NYSE AMERICAN", "NYSE_AMERICAN"],
  ["NYSE MKT", "NYSE_AMERICAN"],
]);

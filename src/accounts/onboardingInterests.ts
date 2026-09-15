import { z } from "zod";
import { TickerSymbolSchema } from "../research/domain/ids";

export const OnboardingSymbolsSchema = z
  .array(TickerSymbolSchema)
  .min(1)
  .max(3)
  .refine(
    (symbols) => new Set(symbols).size === symbols.length,
    "Duplicate stocks",
  );
export const OnboardingStockSchema = z.object({
  symbol: TickerSymbolSchema,
  providerCode: z.string().min(1),
  company: z.string().min(1),
  exchange: z.string(),
});
export type OnboardingStock = z.infer<typeof OnboardingStockSchema>;

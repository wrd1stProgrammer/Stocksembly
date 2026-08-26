import { z } from "zod";

export const SearchResponseSchema = z.strictObject({
  current_page: z.number().int().positive(),
  has_more: z.boolean(),
  symbols: z.array(
    z.strictObject({
      name: z.string().trim().min(1).max(512),
      code: z.string().trim().min(3).max(64),
      type: z.string().trim().min(1).max(64).optional(),
      exchange: z.string().trim().min(1).max(128).optional(),
      currency_code: z.string().trim().length(3).optional(),
      country: z.string().trim().length(2).optional(),
      description: z.string().trim().max(4_096).optional(),
      status: z.string().trim().min(1).max(32).optional(),
    }),
  ),
});

export const InfoResponseSchema = z.looseObject({
  code: z.string().trim().min(3).max(64),
  name: z.string().trim().min(1).max(512).optional(),
  type: z.string().trim().min(1).max(64).optional(),
  exchange: z.string().trim().min(1).max(128).optional(),
  currency_code: z.string().trim().length(3).optional(),
  status: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]).optional(),
  earnings_release_date: z.number().finite().nonnegative().optional(),
  earnings_release_next_date: z.number().finite().nonnegative().optional(),
  earnings_per_share_fq: z.number().finite().optional(),
  earnings_per_share_forecast_fq: z.number().finite().optional(),
  earnings_per_share_forecast_next_fq: z.number().finite().optional(),
  eps_surprise_fq: z.number().finite().optional(),
  eps_surprise_percent_fq: z.number().finite().optional(),
  revenue_fq: z.number().finite().optional(),
  revenue_forecast_fq: z.number().finite().optional(),
  revenue_forecast_next_fq: z.number().finite().optional(),
  revenue_surprise_fq: z.number().finite().optional(),
  revenue_surprise_percent_fq: z.number().finite().optional(),
  splits: z
    .array(
      z.strictObject({
        time: z.number().finite().nonnegative(),
        factor: z.number().finite().positive(),
      }),
    )
    .optional(),
});

export const QuoteResponseSchema = z.looseObject({
  total_items: z.number().int().nonnegative(),
  data: z.array(
    z.looseObject({
      code: z.string().trim().min(3).max(64),
      status: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
      lp_time: z.number().finite().nonnegative().optional(),
      last_price: z.number().finite().optional(),
      change: z.number().finite().optional(),
      change_p: z.number().finite().optional(),
      currency_code: z.string().trim().length(3).optional(),
    }),
  ),
});

export const RawBarSchema = z
  .strictObject({
    time: z.number().finite().nonnegative(),
    open: z.number().finite(),
    high: z.number().finite(),
    low: z.number().finite(),
    close: z.number().finite(),
    volume: z.number().finite().nonnegative(),
    type: z.string().optional(),
  })
  .superRefine((bar, context) => {
    if (
      bar.high < bar.low ||
      bar.high < bar.open ||
      bar.high < bar.close ||
      bar.low > bar.open ||
      bar.low > bar.close
    )
      context.addIssue({
        code: "custom",
        message: "invalid OHLC price ordering",
      });
  });

export const SeriesResponseSchema = z.strictObject({
  code: z.string().trim().min(3).max(64),
  last_update: z.number().finite().nonnegative(),
  _ct: z.number().finite().nonnegative(),
  bar_type: z.string().trim().min(1).max(16),
  series: z.array(RawBarSchema).min(1).max(30_000),
  bar_end: z.number().finite().nonnegative().optional(),
});

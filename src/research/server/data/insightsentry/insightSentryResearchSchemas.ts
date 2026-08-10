import { z } from "zod";

const UnixSecondsSchema = z.number().int().nonnegative();
const UnixMillisecondsSchema = z.number().int().nonnegative();

const FundamentalValueSchema = z.json();

export const FundamentalsResponseSchema = z.strictObject({
  code: z.string().min(1),
  last_update: UnixMillisecondsSchema,
  _ct: UnixMillisecondsSchema.optional(),
  data: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().optional(),
      category: z.string().optional(),
      group: z.string().optional(),
      type: z
        .enum(["number", "array", "string", "boolean", "object"])
        .optional(),
      period: z.string().optional(),
      value: FundamentalValueSchema.optional(),
    }),
  ),
});

export const FundamentalsSeriesResponseSchema = z.strictObject({
  code: z.string().min(1),
  last_update: UnixMillisecondsSchema,
  total_items: z.number().int().nonnegative(),
  data: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1),
      data: z.array(
        z.object({ time: UnixSecondsSchema }).catchall(z.number().finite()),
      ),
    }),
  ),
});

export const NewsResponseSchema = z.strictObject({
  last_update: UnixSecondsSchema,
  total_items: z.number().int().nonnegative(),
  current_items: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  has_next: z.boolean(),
  hasNext: z.boolean().optional(),
  current_page: z.number().int().positive().optional(),
  total_page: z.number().int().positive().optional(),
  data: z
    .array(
      z.strictObject({
        link: z.url().optional(),
        title: z.string().min(1).optional(),
        source: z.string().min(1).optional(),
        content: z.string().optional(),
        published_at: UnixSecondsSchema,
        related_symbols: z.array(z.string()).optional(),
      }),
    )
    .max(500),
});

export const NewsClassificationSchema = z.strictObject({
  candidateId: z.string().min(1),
  eventKey: z.string().min(1).max(160),
  category: z.enum(["company", "market", "risk"]),
  relevance: z.number().min(0).max(1),
  materiality: z.enum(["material", "immaterial"]),
  novelty: z.enum(["unique", "duplicate"]),
  direction: z.enum(["positive", "negative", "mixed", "neutral"]),
  horizon: z.enum(["immediate", "near_term", "long_term"]),
  verificationNeed: z.enum(["required", "recommended", "none"]),
});

export type NewsClassification = z.infer<typeof NewsClassificationSchema>;

export const NewsClassifierResponseSchema = z.strictObject({
  classifications: z.array(NewsClassificationSchema),
});

export const DocumentIndexSchema = z.array(
  z.strictObject({
    id: z.string().min(1),
    category: z.string().min(1),
    reported_time: UnixSecondsSchema,
    is_available: z.boolean(),
    title: z.string().min(1),
    is_pdf: z.boolean(),
    fiscal_period: z.string().optional(),
    fiscal_year: z.number().int().optional(),
    form: z.string().optional(),
  }),
);

export const DocumentContentSchema = z.strictObject({
  title: z.string().min(1),
  published_at: UnixSecondsSchema,
  content: z.string(),
});

export const EarningsCalendarSchema = z.strictObject({
  total_count: z.number().int().nonnegative(),
  range: z.string(),
  last_update: UnixSecondsSchema,
  data: z.array(
    z.strictObject({
      code: z.string().min(1),
      name: z.string().min(1),
      earnings_release_next_date: UnixSecondsSchema,
      earnings_release_date: UnixSecondsSchema,
      earnings_per_share_fq: z.number().finite().optional(),
      earnings_per_share_forecast_next_fq: z.number().finite().optional(),
      eps_surprise_fq: z.number().finite().optional(),
      eps_surprise_percent_fq: z.number().finite().optional(),
      revenue_fq: z.number().finite().optional(),
      revenue_forecast_next_fq: z.number().finite().optional(),
      market_cap: z.number().finite().optional(),
      earnings_per_share_forecast_fq: z.number().finite().optional(),
      revenue_forecast_fq: z.number().finite().optional(),
      currency_code: z.string().optional(),
      country: z.string().optional(),
      revenue_surprise_fq: z.number().finite().optional(),
      revenue_surprise_percent_fq: z.number().finite().optional(),
    }),
  ),
});

export const PeerScreenResponseSchema = z.strictObject({
  providerUpdatedAt: z.string().datetime(),
  retrievedAt: z.string().datetime(),
  sector: z.string().min(1),
  selectorVersion: z.string().min(1),
  selectionCache: z.enum(["hit", "miss"]),
  subject: z.strictObject({
    symbol: z.string().min(1),
    name: z.string().min(1),
    sector: z.string().min(1),
    marketCap: z.number().finite().nonnegative().optional(),
    priceEarningsTtm: z.number().finite().optional(),
    enterpriseValueEbitdaTtm: z.number().finite().optional(),
    enterpriseValueRevenueTtm: z.number().finite().optional(),
    revenueGrowthTtm: z.number().finite().optional(),
    grossMarginTtm: z.number().finite().optional(),
    operatingMarginTtm: z.number().finite().optional(),
    performance3Month: z.number().finite().optional(),
    performance1Year: z.number().finite().optional(),
  }),
  relativeValuation: z.array(
    z.strictObject({
      metric: z.enum([
        "price_earnings_ttm",
        "enterprise_value_ebitda_ttm",
        "enterprise_value_to_revenue_ttm",
      ]),
      peerMedian: z.number().finite(),
      peerCount: z.number().int().positive(),
      subjectValue: z.number().finite().optional(),
      premiumDiscountPercent: z.number().finite().optional(),
    }),
  ),
  peers: z.array(
    z.strictObject({
      symbol: z.string().min(1),
      name: z.string().min(1),
      sector: z.string().min(1),
      classification: z.enum(["direct_competitor", "operating_comparable"]),
      selectionScore: z.number().finite().min(0).max(1),
      selectionReasons: z.array(z.string().min(1)).min(1).max(4),
      marketCap: z.number().finite().nonnegative().optional(),
      priceEarningsTtm: z.number().finite().optional(),
      enterpriseValueEbitdaTtm: z.number().finite().optional(),
      enterpriseValueRevenueTtm: z.number().finite().optional(),
      revenueGrowthTtm: z.number().finite().optional(),
      grossMarginTtm: z.number().finite().optional(),
      operatingMarginTtm: z.number().finite().optional(),
      performance3Month: z.number().finite().optional(),
      performance1Year: z.number().finite().optional(),
    }),
  ),
});

export const OptionsResponseSchema = z.strictObject({
  underlying_code: z.string().min(1),
  last_update: UnixMillisecondsSchema,
  next_token: z.string().min(1).optional(),
  last_price: z.number().finite().optional(),
  data: z.array(
    z.strictObject({
      code: z.string().min(1),
      description: z.string(),
      expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      type: z.enum(["CALL", "PUT"]),
      status: z.string(),
      style: z.string(),
      strike_price: z.string(),
      multiplier: z.string(),
      size: z.string(),
      open_interest: z.string().nullable().optional(),
      open_interest_date: z.string().nullable().optional(),
      close_price: z.string().nullable().optional(),
      close_price_date: z.string().nullable().optional(),
    }),
  ),
});

import { z } from "zod";

export const TECHNICAL_TIMEFRAMES = ["1h", "4h", "1d", "1w"] as const;
export const TechnicalTimeframeSchema = z.enum(TECHNICAL_TIMEFRAMES);
export type TechnicalTimeframe = z.infer<typeof TechnicalTimeframeSchema>;
const TextSchema = z
  .object({ en: z.string().max(1600), ko: z.string().max(1600) })
  .strict()
  .readonly();
const PriceSchema = z.number().finite().positive();
export const ChartBarSchema = z
  .object({
    timestamp: z.string().datetime(),
    closedAt: z.string().datetime(),
    open: PriceSchema,
    high: PriceSchema,
    low: PriceSchema,
    close: PriceSchema,
    volume: z.number().finite().nonnegative(),
  })
  .strict()
  .readonly();
export type ChartBar = z.infer<typeof ChartBarSchema>;
const AnchorSchema = z
  .object({
    index: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
    price: PriceSchema,
  })
  .strict()
  .readonly();
export const ChartDrawingSchema = z
  .object({
    id: z.string().max(160),
    kind: z.enum(["support", "resistance", "trend", "channel", "order_block"]),
    side: z.enum(["demand", "supply"]),
    low: PriceSchema,
    high: PriceSchema,
    anchors: z.array(AnchorSchema).min(1).max(8).readonly(),
    confirmedAt: z.string().datetime(),
    confirmedIndex: z.number().int().nonnegative(),
    strength: z.enum(["tentative", "established"]),
    touches: z.number().int().positive(),
    state: z.enum(["active", "retested"]),
    reason: TextSchema,
    parallelOffset: z.number().finite().optional(),
  })
  .strict()
  .readonly();
export type ChartDrawing = z.infer<typeof ChartDrawingSchema>;
export const TechnicalChartFrameSchema = z
  .object({
    timeframe: TechnicalTimeframeSchema,
    status: z.enum(["ready", "partial", "unavailable"]),
    origin: z.enum(["native", "derived_from_daily"]),
    bars: z.array(ChartBarSchema).max(1000).readonly(),
    requestedBars: z.number().int().positive(),
    excludedOpenBars: z.number().int().nonnegative(),
    regime: z.enum(["rising", "falling", "range", "unknown"]),
    atr14: z.number().finite().nonnegative().optional(),
    volumeRatio20: z.number().finite().nonnegative().optional(),
    averages: z
      .array(
        z
          .object({
            period: z.union([z.literal(20), z.literal(50), z.literal(200)]),
            points: z
              .array(
                z
                  .object({
                    index: z.number().int().nonnegative(),
                    price: PriceSchema,
                  })
                  .strict()
                  .readonly(),
              )
              .max(1000)
              .readonly(),
          })
          .strict()
          .readonly(),
      )
      .max(3)
      .readonly(),
    drawings: z.array(ChartDrawingSchema).max(7).readonly(),
    scenarios: z
      .array(
        z
          .object({
            direction: z.enum(["up", "down"]),
            boundary: PriceSchema,
            invalidation: PriceSchema,
            target: PriceSchema.optional(),
            drawingIds: z.array(z.string()).max(4).readonly(),
          })
          .strict()
          .readonly(),
      )
      .max(2)
      .readonly(),
    observation: TextSchema,
    limitation: TextSchema.optional(),
  })
  .strict()
  .readonly();
export type TechnicalChartFrame = z.infer<typeof TechnicalChartFrameSchema>;
export const TechnicalChartSnapshotSchema = z
  .object({
    schemaVersion: z.literal("technical-chart-v1"),
    algorithmVersion: z.literal("structure-v1"),
    symbol: z.string().max(64),
    analysisAsOf: z.string().datetime(),
    provider: z.literal("InsightSentry"),
    timezone: z.literal("America/New_York"),
    adjustment: z.literal(
      "split-adjusted; dividends-unadjusted; regular-session",
    ),
    dataHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["ready", "partial", "unavailable"]),
    frames: z.array(TechnicalChartFrameSchema).length(4).readonly(),
    synthesis: TextSchema,
    commentarySource: z.enum(["june", "calculated"]),
  })
  .strict()
  .readonly();
export type TechnicalChartSnapshot = z.infer<
  typeof TechnicalChartSnapshotSchema
>;
export const TechnicalChartManifestSchema = z
  .object({
    schemaVersion: z.literal("technical-chart-v1"),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    analysisAsOf: z.string().datetime(),
    status: z.enum(["ready", "partial", "unavailable"]),
  })
  .strict()
  .readonly();
export type TechnicalChartManifest = z.infer<
  typeof TechnicalChartManifestSchema
>;

// A string keeps this optional enrichment independent of the mandatory memo schema.
// Its internal JSON and references are validated only after the memo is accepted.
const CommentaryTextSchema = TextSchema.unwrap().partial();
export const ChartCommentarySchema = z
  .object({
    synthesis: CommentaryTextSchema,
    frames: z
      .array(
        z
          .object({
            timeframe: TechnicalTimeframeSchema,
            focusDrawingIds: z.array(z.string()).max(7),
            observation: CommentaryTextSchema,
          })
          .strict(),
      )
      .max(4),
  })
  .strict();

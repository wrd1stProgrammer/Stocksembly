import { z } from "zod";

export const InsightSentryCacheMetadataSchema = z
  .object({
    cacheKey: z.string().min(1),
    retrievedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    responseBytes: z.number().int().nonnegative(),
  })
  .strict();

export const InsightSentryQuotaObservationSchema = z
  .object({
    observedAt: z.string().datetime(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    resetAt: z.string().datetime().optional(),
  })
  .strict();

export const InsightSentryRetryIntentSchema = z
  .object({
    cacheKey: z.string().min(1),
    classification: z.enum([
      "rate_limited",
      "server_error",
      "network",
      "timeout",
    ]),
    retryAt: z.string().datetime(),
    ordinal: z.number().int().positive(),
    endpoint: z.string().min(1),
    status: z.number().int().min(100).max(599).optional(),
  })
  .strict();

export const InsightSentryRetryStateSchema = z
  .object({ intents: z.array(InsightSentryRetryIntentSchema) })
  .strict();

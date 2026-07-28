import { z } from "zod";

const EXPECTED_RAPIDAPI_HOST = "insightsentry.p.rapidapi.com";
const EnvironmentSchema = z.object({
  INSIGHTSENTRY_RAPIDAPI_KEY: z.unknown().optional(),
  INSIGHTSENTRY_RAPIDAPI_HOST: z.unknown().optional(),
});
const RapidApiKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(4_096)
  .regex(/^[^\r\n]+$/);
const RapidApiHostSchema = z
  .string()
  .trim()
  .pipe(z.literal(EXPECTED_RAPIDAPI_HOST));

export type InsightSentryRequestHeaders = Readonly<{
  Accept: "application/json";
  "x-rapidapi-host": string;
  "x-rapidapi-key": string;
}>;

export type InsightSentryConfig = {
  readonly rapidApiHost: typeof EXPECTED_RAPIDAPI_HOST;
  readonly requestHeaders: () => InsightSentryRequestHeaders;
  readonly toJSON: () => Readonly<{
    rapidApiHost: typeof EXPECTED_RAPIDAPI_HOST;
  }>;
};

export type InsightSentryConfigUnavailableReason =
  | "missing_key"
  | "invalid_key"
  | "missing_host"
  | "invalid_host";

export type InsightSentryConfigResult =
  | {
      readonly status: "not_configured";
      readonly reason: InsightSentryConfigUnavailableReason;
    }
  | {
      readonly status: "available";
      readonly config: InsightSentryConfig;
    };

function unavailable(
  reason: InsightSentryConfigUnavailableReason,
): InsightSentryConfigResult {
  return Object.freeze({ status: "not_configured", reason });
}

export function loadInsightSentryConfig(
  environment: unknown = process.env,
): InsightSentryConfigResult {
  const parsedEnvironment = EnvironmentSchema.parse(environment);
  const rawKey = parsedEnvironment.INSIGHTSENTRY_RAPIDAPI_KEY;
  if (rawKey === undefined) return unavailable("missing_key");
  const key = RapidApiKeySchema.safeParse(rawKey);
  if (!key.success)
    return unavailable(
      typeof rawKey === "string" && rawKey.trim().length === 0
        ? "missing_key"
        : "invalid_key",
    );

  const rawHost = parsedEnvironment.INSIGHTSENTRY_RAPIDAPI_HOST;
  if (rawHost === undefined) return unavailable("missing_host");
  const host = RapidApiHostSchema.safeParse(rawHost);
  if (!host.success) return unavailable("invalid_host");

  const config: InsightSentryConfig = Object.freeze({
    rapidApiHost: host.data,
    requestHeaders: () =>
      Object.freeze({
        Accept: "application/json",
        "x-rapidapi-host": host.data,
        "x-rapidapi-key": key.data,
      }),
    toJSON: () => Object.freeze({ rapidApiHost: host.data }),
  });
  return Object.freeze({ status: "available", config });
}

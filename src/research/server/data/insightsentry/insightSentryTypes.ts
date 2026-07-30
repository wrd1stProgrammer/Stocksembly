import type { z } from "zod";
import type { InsightSentryConfigResult } from "./insightSentryConfig";
import type { InsightSentryWireAdapter } from "./insightSentryTransport";

export const INSIGHTSENTRY_CONTRACT_VERSION = "v3" as const;

export type InsightSentryParameterValue =
  | string
  | number
  | boolean
  | readonly string[];

export type InsightSentryCacheIdentity = {
  readonly endpoint: string;
  readonly pathSegments: readonly string[];
  readonly parameters: Readonly<Record<string, InsightSentryParameterValue>>;
  readonly method?: "GET" | "POST";
  readonly requestBody?: Readonly<Record<string, InsightSentryParameterValue>>;
  readonly adjustmentFlags?: Readonly<Record<string, boolean>>;
  readonly asOfBucket: string;
};

export type InsightSentryRequest<T> = InsightSentryCacheIdentity & {
  readonly schema: z.ZodType<T>;
  readonly cacheTtlMilliseconds: number;
  readonly freshness?: {
    readonly maxAgeMilliseconds: number;
    readonly timestamp: (data: T) => string;
  };
  readonly retryOrdinal?: number;
};

export type InsightSentryClock = {
  readonly now: () => number;
  readonly isoNow: () => string;
};

export type InsightSentryClientOptions = {
  readonly configuration: InsightSentryConfigResult;
  readonly dataRoot: string;
  readonly adapter?: InsightSentryWireAdapter;
  readonly clock?: InsightSentryClock;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
  readonly maxResponseBytes?: number;
  readonly onUpstreamRequest?: (input: {
    readonly cacheKey: string;
    readonly endpoint: string;
    readonly url: string;
  }) => void;
  readonly onResponse?: (input: {
    readonly cacheKey: string;
    readonly endpoint: string;
    readonly cacheStatus: "hit" | "miss";
    readonly retrievedAt: string;
    readonly bytes: Uint8Array;
  }) => void;
};

export type InsightSentryResult<T> = {
  readonly data: T;
  readonly cacheKey: string;
  readonly cacheStatus: "hit" | "miss";
  readonly retrievedAt: string;
  readonly responseBytes: number;
};

export interface InsightSentryClient {
  readonly get: <T>(
    request: InsightSentryRequest<T>,
  ) => Promise<InsightSentryResult<T>>;
}

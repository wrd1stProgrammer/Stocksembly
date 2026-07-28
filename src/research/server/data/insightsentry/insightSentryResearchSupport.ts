import { ZodError } from "zod";
import { InsightSentryClientError } from "./insightSentryClient";
import type {
  FamilyResult,
  InsightSentryResearchFamily,
  InsightSentryResearchRollout,
  PitUnsafeDataset,
} from "./insightSentryResearchContracts";

export const PIT_UNSAFE_LIMITATIONS = [
  "provider_dataset_not_point_in_time_safe",
] as const;

export function unixSecondsToIso(value: number): string {
  return new Date(value * 1_000).toISOString();
}

export function unixMillisecondsToIso(value: number): string {
  return new Date(value).toISOString();
}

export function pitUnsafeTimestamps(
  providerUpdatedAt: string,
  retrievedAt: string,
): Pick<
  PitUnsafeDataset,
  "providerUpdatedAt" | "retrievedAt" | "pitSafe" | "limitations"
> {
  return Object.freeze({
    providerUpdatedAt,
    retrievedAt,
    pitSafe: false,
    limitations: PIT_UNSAFE_LIMITATIONS,
  });
}

export function withheldWhenDisabled<T>(
  rollout: InsightSentryResearchRollout,
  family: InsightSentryResearchFamily,
): FamilyResult<T> | undefined {
  return rollout[family]
    ? undefined
    : Object.freeze({
        status: "withheld",
        limitation: "rollout_disabled",
      });
}

export function familyFailure<T>(error: unknown): FamilyResult<T> {
  if (error instanceof ZodError)
    return Object.freeze({
      status: "unavailable",
      limitation: "provider_unavailable",
    });
  if (!(error instanceof InsightSentryClientError)) throw error;
  switch (error.code) {
    case "stale":
      return Object.freeze({
        status: "stale",
        limitation: "provider_stale",
      });
    case "unauthorized":
    case "subscription_required":
    case "missing_configuration":
      return Object.freeze({
        status: "withheld",
        limitation: "not_entitled",
      });
    case "rate_limited":
    case "server_error":
    case "network":
    case "timeout":
    case "non_json":
    case "schema_drift":
    case "oversized":
    case "unexpected_status":
      return Object.freeze({
        status: "unavailable",
        limitation: "provider_unavailable",
      });
  }
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

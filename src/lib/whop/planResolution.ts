import type { BillingPlanKey, BillingTier } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;
const ANNUAL_PERIOD_MINIMUM_MS = 300 * DAY_MS;
const MONTHLY_PERIOD_MINIMUM_MS = 20 * DAY_MS;

function timestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveBillingPlanKey(input: {
  readonly directPlanKey: BillingPlanKey | undefined;
  readonly tier: BillingTier;
  readonly currentPeriodStart: string | undefined;
  readonly currentPeriodEnd: string | undefined;
}): BillingPlanKey | undefined {
  if (input.directPlanKey !== undefined) return input.directPlanKey;
  if (input.tier === "free") return undefined;

  const start = timestamp(input.currentPeriodStart);
  const end = timestamp(input.currentPeriodEnd);
  if (start === undefined || end === undefined || end <= start)
    return undefined;

  const period = end - start;
  if (period >= ANNUAL_PERIOD_MINIMUM_MS) return `${input.tier}-annual`;
  if (period >= MONTHLY_PERIOD_MINIMUM_MS) return `${input.tier}-monthly`;
  return undefined;
}

import type { ResearchTarget } from "../../research/domain/researchTarget";
import type { BillingTier } from "./contracts";

export const MONTHLY_CREDIT_ALLOWANCE: Readonly<Record<BillingTier, number>> = {
  free: 0,
  pro: 100,
  ultra: 500,
};

export const CREDIT_COSTS = {
  committeeResearch: 10,
  departmentResearch: 5,
  chatBundle: 5,
  chatBundleSize: 100,
  researchRoomView: 3,
} as const;

export function paidCreditGrantDelta(
  grantedThisPeriod: number,
  targetAllowance: number,
): number {
  return Math.max(0, targetAllowance - grantedThisPeriod);
}

export type CreditUsageCode =
  | "full_research"
  | "department_research"
  | "chat_bundle"
  | "research_room";

export function researchCreditCost(target: ResearchTarget | undefined): number {
  return target?.kind === "department"
    ? CREDIT_COSTS.departmentResearch
    : CREDIT_COSTS.committeeResearch;
}

export function isSuccessfulResearchStatus(status: string): boolean {
  return status === "completed" || status === "complete-with-limitations";
}

export function researchUsageCode(
  target: ResearchTarget | undefined,
): "full_research" | "department_research" {
  return target?.kind === "department"
    ? "department_research"
    : "full_research";
}

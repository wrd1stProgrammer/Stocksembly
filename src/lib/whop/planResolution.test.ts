import { describe, expect, it } from "vitest";
import { resolveBillingPlanKey } from "./planResolution";

describe("resolveBillingPlanKey", () => {
  it("infers an annual legacy plan from the paid tier and provider period", () => {
    expect(
      resolveBillingPlanKey({
        directPlanKey: undefined,
        tier: "pro",
        currentPeriodStart: "2026-08-04T17:23:02.187Z",
        currentPeriodEnd: "2027-08-04T17:23:02.187Z",
      }),
    ).toBe("pro-annual");
  });

  it("keeps the provider plan mapping when it is available", () => {
    expect(
      resolveBillingPlanKey({
        directPlanKey: "ultra-monthly",
        tier: "ultra",
        currentPeriodStart: "2026-08-01T00:00:00.000Z",
        currentPeriodEnd: "2027-08-01T00:00:00.000Z",
      }),
    ).toBe("ultra-monthly");
  });
});

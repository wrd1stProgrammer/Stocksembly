import { describe, expect, it } from "vitest";
import type { WhopWebhookEvent } from "../whop/server";
import { purchaseProperties } from "./server";

const payment: WhopWebhookEvent = {
  id: "evt-test",
  type: "payment.succeeded",
  sourceEnvironment: "production",
  data: {
    total: "19",
    currency: "usd",
    metadata: {
      stocksembly_meta_consent: "granted",
      stocksembly_principal_id: "pseudonymous-id",
    },
  },
};
describe("PostHog confirmed revenue", () => {
  it("uses actual amount and a repeatable deduplication key", () => {
    expect(purchaseProperties(payment)).toMatchObject({
      revenue: 19,
      currency: "USD",
      distinct_id: "pseudonymous-id",
    });
    expect(purchaseProperties(payment)).toEqual(purchaseProperties(payment));
  });
  it("excludes sandbox, unconsented and non-payment events", () => {
    expect(
      purchaseProperties({ ...payment, sourceEnvironment: "sandbox" }),
    ).toBeUndefined();
    expect(
      purchaseProperties({ ...payment, type: "membership.activated" }),
    ).toBeUndefined();
    expect(purchaseProperties({ ...payment, data: {} })).toBeUndefined();
  });
});

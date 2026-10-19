import { describe, expect, it } from "vitest";
import type { WhopWebhookEvent } from "../whop/server";
import { purchaseProperties } from "./server";

const payment = {
  id: "evt-test",
  type: "payment.succeeded",
  sourceEnvironment: "production",
  data: {
    id: "pay_test",
    total: "19",
    currency: "usd",
    metadata: {
      stocksembly_meta_consent: "granted",
      stocksembly_principal_id: "pseudonymous-id",
    },
  },
} satisfies WhopWebhookEvent;
describe("PostHog confirmed revenue", () => {
  it("uses actual amount and a repeatable deduplication key", () => {
    expect(purchaseProperties(payment)).toMatchObject({
      revenue: 19,
      currency: "USD",
      distinct_id: "pseudonymous-id",
      transaction_id: "pay_test",
    });
    expect(purchaseProperties(payment)).toEqual(
      purchaseProperties({ ...payment, id: "another_webhook_delivery" }),
    );
    expect(purchaseProperties(payment)?.$insert_id).not.toEqual(
      purchaseProperties({
        ...payment,
        data: { ...payment.data, id: "pay_renewal" },
      })?.$insert_id,
    );
  });
  it("merges metadata and uses the same subtotal as GA4", () => {
    expect(
      purchaseProperties({
        ...payment,
        data: {
          ...payment.data,
          subtotal: "17",
          membership: { metadata: { stocksembly_meta_consent: "denied" } },
        },
      }),
    ).toMatchObject({ revenue: 17, distinct_id: "pseudonymous-id" });
  });
  it("rejects free payments, missing payment IDs and internal tests", () => {
    for (const data of [
      { ...payment.data, total: 0 },
      { ...payment.data, id: undefined },
      {
        ...payment.data,
        metadata: {
          stocksembly_meta_consent: "granted",
          stocksembly_principal_id: "pseudonymous-id",
          stocksembly_billing_test: "live-dollar",
        },
      },
    ])
      expect(purchaseProperties({ ...payment, data })).toBeUndefined();
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

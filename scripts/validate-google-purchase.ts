// Run with Vite's SSR build, then Node. Only Google's validation endpoint is used.
// Synthetic data never creates a report event, a charge, or a subscription.
import { googlePurchasePayload } from "../src/lib/analytics/googleServer";

const payload = googlePurchasePayload({
  id: "evt_schema_validation",
  type: "payment.succeeded",
  sourceEnvironment: "production",
  data: {
    id: "pay_schema_validation",
    subtotal: "19",
    currency: "usd",
    metadata: {
      stocksembly_ga_consent: "granted",
      stocksembly_ga_client_id: "123.456",
      stocksembly_ga_session_id: String(Math.floor(Date.now() / 1000) - 60),
      stocksembly_plan_key: "pro-monthly",
    },
  },
});
if (!payload) throw new Error("Purchase payload was unexpectedly excluded");

const url = new URL("https://www.google-analytics.com/debug/mp/collect");
url.searchParams.set("measurement_id", "G-YRQDC6R5TL");
// The validation API does not validate credentials; never load a real secret.
url.searchParams.set("api_secret", "schema-validation-only");
const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    ...payload,
    validation_behavior: "ENFORCE_RECOMMENDATIONS",
  }),
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`Validation HTTP ${response.status}`);
const result: unknown = await response.json();
if (
  !result ||
  typeof result !== "object" ||
  !("validationMessages" in result) ||
  !Array.isArray(result.validationMessages)
) {
  throw new Error("Unexpected validation response");
}
console.log(JSON.stringify({ validationMessages: result.validationMessages }));
if (result.validationMessages.length) process.exitCode = 1;

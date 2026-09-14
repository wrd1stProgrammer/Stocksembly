# Embedded wallet availability investigation

Date: 2026-09-14
Status: Provider limitation reproduced; no production fix applied.

## Scope and observed behavior

Compare the same production Pro monthly checkout configuration on the same Mac and Chrome profile. No payment was submitted, no terms were accepted, and no payment credentials were changed.

| Surface | Observed wallet choices |
| --- | --- |
| Stocksembly embedded checkout | Apple Pay, but no Google Pay |
| Whop hosted checkout for the same configuration | Apple Pay and Google Pay |
| Local preview with the official express component restricted to Google Pay | No express button; its iframe resolves to zero height |

The local preview used the real modified Stocksembly modal and the existing production checkout configuration. It was not a successful payment test or a production-origin express test.

## Findings

1. Stocksembly does not provide a payment-method allowlist, exclusion list, or `setupFutureUsage="off_session"` to the embed. The server also does not restrict the checkout configuration to four payment methods.
2. The actual iframe includes the SDK's `payment` permission. The public homepage response inspected did not contain a restrictive Permissions-Policy header.
3. Whop's served wallet-selector implementation stores a single resolved PaymentRequest method and renders either Apple Pay or Google Pay. Its method detection returns the first eligible result, with Apple Pay ordered first. This explains the observed Apple Pay preference; it is not a general macOS prohibition on Google Pay.
4. Whop offers `WhopExpressCheckoutButton` with `methods={["google-pay"]}` and `checkoutConfigurationId`. A prototype connected it to the same configuration, preserving the return URL and environment. TypeScript and the targeted Biome check passed, but browser QA showed no button.
5. Whop's `useSupportsExpressCheckout` explicitly requires a supported processor and both `!requiresTermsAgreement` and `!supportsVatId`. The production checkout visibly requires a terms checkbox. That provider condition blocks the attempted express solution regardless of the local preview's additional origin differences.
6. Checkbox activation in the merchant dashboard is not a promise that every method is eligible for every currency, country, recurring plan, or browser.

The nonfunctional prototype was removed. No wallet capability was faked, no mandatory agreement was disabled, and no hosted checkout was forced into an unsupported iframe.

## Evidence references

These are public provider assets inspected on the date above; provider deployments can replace them.

- [Whop embed documentation](https://docs.whop.com/manage-your-business/payment-processing/embed-checkout)
- [Google Pay browser compatibility](https://developers.google.com/pay/api/web/guides/test-and-deploy/integration-checklist)
- [Single-method wallet selector](https://whop.com/_next/static/immutable/chunks/431tqlcy9v1uo.js): `eR`, `paymentRequest.method`, conditional Apple Pay / Google Pay selector.
- [Wallet selection order](https://whop.com/_next/static/immutable/chunks/0yn7x_b13bw35.js): `eligiblePaymentMethods`, `canMakePayment`, first eligible result.
- [Express eligibility gate](https://whop.com/_next/static/immutable/chunks/3s40heh3i1lr3.js): `useSupportsExpressCheckout`, `REQUIRE_TOS`, `VAT_ID`.

## Provider support draft (not sent)

Our production USD recurring checkout on macOS Chrome shows both Apple Pay and Google Pay in your hosted checkout, but only Apple Pay in your official embedded checkout for the same checkout configuration. The iframe includes the SDK payment permissions and we do not restrict payment methods. The embedded PaymentRequest selector appears to select only the first available wallet. We also tried your official Google-Pay-only express component, but it does not render for a checkout requiring terms agreement, consistent with `useSupportsExpressCheckout`.

Please provide a supported way to display both wallets in embedded checkout while preserving the required terms agreement, recurring subscription, and checkout-configuration metadata. If this requires a provider change, please enable independent Google Pay selection in the embedded payment-method list rather than requiring merchants to disable terms agreement.

## Resolution criteria

- Both wallet options are available inside the Stocksembly modal when the browser/account supports them.
- Terms agreement stays enforced.
- Existing checkout configuration and account metadata stay intact.
- Unsupported methods remain governed by actual provider eligibility.
- Verify display on the production HTTPS origin, then verify a separately authorized payment and webhook entitlement flow before claiming payment success.

Until Whop supplies a supported solution, the existing “Open checkout in a new tab” link exposes Google Pay on the tested Mac/Chrome configuration. No support message has been sent and no merchant configuration has been changed.

## Accepted follow-up: hosted checkout

The owner chose hosted checkout instead of continuing to embed Whop. Both pricing entry points now synchronously open a blank tab during the click gesture, obtain the authenticated server checkout configuration, and navigate that tab to the returned purchase URL. A blocked or closed popup falls back to same-tab navigation. Authentication or checkout creation failures close the temporary tab. The server-created return URL and account metadata remain unchanged.

Manual QA used the real PublicPricingGrid and hook in a local harness with simulated authentication/session responses, navigating a new Chrome tab to an existing production Whop checkout. This verifies the client launch behavior, not a new production deployment or a completed payment. Focused hosted-checkout tests, TypeScript, Biome, and diff whitespace checks passed. The broader SubscriptionModal test has an existing signup-credit expectation mismatch (expects 4, renders 5); the checkout change does not alter that value.

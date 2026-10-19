# Google Ads measurement

GA4 property 515903916, web stream 15409752350, measurement ID G-YRQDC6R5TL.

Consented product events are sent to both PostHog and GA4. Email confirmation
maps to GA4 `sign_up`; `checkout_started` remains a diagnostic event, not revenue.
OAuth signup is not covered by the existing email-confirmation event.

Checkout reads the GA tag's client/session IDs, not parsed GA cookie internals.
The IDs are validated and copied into Whop checkout metadata only with the
existing analytics consent. No email, prompt or stock question is sent.

After signature verification and billing fulfillment, `payment.succeeded`
delivers a GA4 Measurement Protocol `purchase`. The transaction ID is the Whop
payment ID, stable across webhook retries. Sandbox, live-dollar billing tests,
zero-value payments and missing consent/identifiers are excluded. Value uses
the actual subtotal when available, otherwise the paid total/amount, never an
advertised plan price. Session attribution is omitted after 24 hours; recurring
payments must not be assigned to an old checkout session.

The server-only `GA4_MEASUREMENT_PROTOCOL_API_SECRET` is stored in GitHub Actions
secrets and delivered by the existing provider Secrets Manager deployment path.
Never place it in a public build argument or NEXT_PUBLIC variable.

Google Ads must be linked to GA4, auto-tagging enabled, and the GA4 purchase key
event imported once. Do not also count the legacy manual subscription action
as a primary purchase conversion. Use purchase as the revenue goal and signup
as a separate diagnostic or explicitly chosen temporary campaign goal.

Changes to this integration require PR review and deployment. Real end-to-end
attribution remains separate from code and schema validation.
A local passing test or an HTTP 2xx from Measurement Protocol does not establish
that Ads has received an attributed purchase. Delivery is best-effort (three
second timeout), without a durable retry queue or refund reconciliation. Existing
checkout consent is a snapshot; later cross-device withdrawal is not reconciled
into already-issued Whop metadata. Blocking and consent refusal leave gaps.

Campaign URL suffixes:

- Search: `utm_source=google&utm_medium=cpc&utm_campaign=stocksembly_us_search&utm_content={creative}&utm_term={keyword}`
- Video: `utm_source=google&utm_medium=paid_video&utm_campaign=stocksembly_us_video&utm_content={creative}`

Final landing: `https://stocksembly.com/`, without a forced locale suffix.
Initial proposed daily budgets: search KRW 30,000, video KRW 40,000.
Keep both campaigns as drafts until assets and live tracking are validated.

## Setup status, October 19, 2026

- Ads customer 158-174-7856 linked to GA4; auto-tagging enabled. Ads
  personalization and embedded Analytics editing access disabled.
- Measurement Protocol secret `stocksembly-whop-purchases` created and stored
  as the repository Actions secret named above. No secret value is in source.
- GA4 purchase imported to Ads as conversion action 7856683617, renamed
  Stocksembly Purchase (GA4), and confirmed as a primary action. Purchase is now
  an account-default goal; legacy subscription is no longer account-default.
  Demand Gen explicitly selects Purchase, with Subscription unselected. The
  existing Search draft still displays Subscription in its read-only creation
  summary: confirm its effective goal or recreate the draft with Purchase before
  publication. Do not assume the account-default change rewrote that draft.
- Search draft 10217823170: US-market English copy, five phrase/exact keywords,
  KRW 30,000 average daily budget, KRW 4,000 CPC ceiling, Search Partners and
  Display disabled, AI Max disabled. A lower initial CPC ceiling is recommended
  but has not been reapplied. Desktop-only exclusions remain incomplete in the
  Search creation wizard. Landing and existing search UTM suffix preserved.
- Demand Gen draft 10219389043 / Stocksembly_US_Video_Test: KRW 40,000/day,
  US presence, English, desktop only, YouTube-only channels, VTC bidding
  disabled, optimized targeting disabled. Five tool-intent search terms in the
  custom segment. Two video ad placeholders with copy and the root landing URL;
  videos and logos are not attached. User will supply final videos later.
- User completed passkey reauthentication. Both video placeholders' names, root
  destination and copy persisted after reload; the campaign reports all changes
  saved. Search and Demand Gen tabs are retained as unpublished drafts.
- Code is prepared on codex/google-ads-tracking for PR review; production
  deployment and end-to-end purchase validation remain required.
- Focused backend/consent/billing tests: 14 passed. TypeScript passed. Changed
  React Doctor scan: 92/100, no issues. No real purchase or Ads-attributed revenue
  has been validated by this setup.

References:

- https://developers.google.com/analytics/devguides/collection/protocol/ga4/use-cases
- https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
- https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events

## No-charge verification, October 20, 2026

PR #127 was merged as `6bd9d6f608fd69cf7ae284400cc1a901491bbb89`; its production
deployment workflow succeeded. This confirms deployment, not a received purchase.
The additional PostHog changes below are local and still require review/deployment.

The payment authority is the signature-verified Whop `payment.succeeded` webhook,
not the checkout button, return page, or `membership.activated`. Fulfillment runs
first. It does not depend on the buyer returning to Stocksembly or keeping the
browser open. The webhook then sends GA4 `purchase` and PostHog
`purchase_completed`. PostHog's `distinct_id` matches the application's hashed
Cognito principal used by browser identification, allowing the purchase to join
the identified user's funnel without sending an email address.

PostHog now merges membership/payment metadata with payment metadata taking
precedence, uses the Whop payment ID as its stable deduplication key and exposes
that ID as `transaction_id` for reconciliation. Separate renewal payments retain
separate IDs. Revenue uses the same subtotal-first convention as GA4. Sandbox,
zero-value, internal billing-test and unconsented payments are excluded. The
legacy `stocksembly_meta_consent` field is populated from analytics consent even
when no Meta cookies exist; it does not require a Meta-ad referral.

Run the non-recording Google schema check:

```sh
pnpm exec vite build --config vite.worker.config.ts --ssr scripts/validate-google-purchase.ts --outDir .stocksembly-verification/google-purchase-validation
node .stocksembly-verification/google-purchase-validation/validate-google-purchase.js
```

It builds the real payload function with synthetic payment data, uses only
`/debug/mp/collect` with `ENFORCE_RECOMMENDATIONS`, and never loads the server
secret or sends to `/mp/collect`. Observed result: `validationMessages: []`.
Google's validation endpoint does not authenticate the API secret and does not
record events in reports. This is not proof of production ingestion or Ads credit.

For PostHog, inspect the identified-user funnel from landing to signup,
`checkout_started`, and `purchase_completed`, breaking down by the initial
Google UTM campaign. Compare `transaction_id` and currency against Whop payments;
do not aggregate different currencies as if they were one. PostHog browser
blocking, consent refusal and switching browsers can prevent a complete funnel.
UTM parameters do not automatically survive an App Store or cross-device flow.

Use the existing GA4-imported Purchase as the single primary revenue conversion
in Google Ads. A PostHog Google Ads destination is an alternative delivery path,
not an additional primary conversion for the same purchase. PostHog funnel
revenue is not the same measurement as Google's attributed conversion value.
Never click the live advertisement solely to generate a test conversion.

Remaining limits: transport delivery is best-effort without a durable retry
queue; a successful HTTP response alone is not receipt/attribution proof; refunds
are not reconciled; later consent withdrawal is not synchronized with checkout
metadata. The first genuine customer payment should be reconciled by payment ID
across Whop, PostHog and GA4, then Ads after processing. No real payment, synthetic
production purchase, campaign publication or deployment was performed in this
verification pass.

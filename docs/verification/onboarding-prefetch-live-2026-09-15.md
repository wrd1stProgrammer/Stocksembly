# Onboarding preparation: live inspection, 2026-09-15

Read-only inspection of the production worker image `worker-sha-5162c0845805481d5f0538ee965cc86d7966417d` and PostgreSQL. No production runs or statuses were modified.

- AMD and TSLA were queued together at 11:55:24 UTC.
- AMD preparation started at 11:55:36 and completed at 11:58:42, one attempt, no preparation error. Worker log duration: 185,871 ms.
- AMD research `93852e93-bb13-43d9-951c-c883fca05a04` started at 11:57:13. Its join log returned ready after 88,773 ms.
- Its committed `evidence:insightsentry:request-ledger` records six upstream calls: SOXX daily comparison, AMD current quote, and four fundamentals-series batches. Remaining available data families were reused by the collector; this is not a paired cold-versus-warm latency benchmark.
- Global background preparation concurrency is one. TSLA started at 12:03:21 after active research no longer blocked background admission.
- The AMD run subsequently became incomplete. The failed job is `memo:market`; the worker recorded `specialist_citation_invalid_after_retry`. Thus joining preparation succeeded, but final publication did not. The repair below addresses that failure separately from preparation reuse.

The picker UI now reuses the existing company-logo component, distinguishes ticker/company/exchange, uses plus/check affordances, and keeps selected chips compact with only a logo, ticker, and removal control. The onboarding header uses the actual app icon. Logo failures retain the existing initial-letter fallback.

## Citation failure repair

The live AMD failure was `specialist_citation_invalid_after_retry` in the market memo, not a final report formatting rejection. The specialist handler now allows one targeted citation correction, then omits entire positions with unbound references while preserving fully bound positions. If no position survives, it records an uncertain coverage limitation with no rejected investment assertions or numeric bindings. The supplied artifact reference identifies the input scope only. This does not change the commit layer's run, snapshot, ownership, fence, or CAS integrity checks.

Previously failed citation jobs retain the recovery code on resume so they can enter the same repair path. Production was inspected read-only; the existing run has not been resumed or republished by this change.

Validation: 13 tests across citation repair, PostgreSQL specialist round, and durable repair prompt passed. The repeated-invalid-citation integration scenario now commits every specialist artifact, permits department consolidation, and verifies the stored memo contains an uncertain coverage limitation rather than the rejected claim. Next.js production build and final TypeScript check passed. The revised onboarding picker was manually exercised in Chrome with local search fixtures, including company logos, selection, and subsequent search. Screenshot: `.stocksembly-verification/design/onboarding-picker.png` (local QA artifact, not committed).

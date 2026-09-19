# Research safety and operating signals

## Input and report integrity

Research creation, follow-up questions and report chat validate nonempty input before work admission. Explicitly empty optional research direction still requests a company overview. Invalid nonempty input is rejected rather than silently converted to an overview. Shared multilingual rules reject high-confidence instruction overrides, credential extraction, SQL/script attacks and clearly unrelated requests. These rules are conservative defense in depth, not complete semantic intent detection or a substitute for authorization. Legitimate cybersecurity investment questions remain allowed. Model prompts separately label user questions and retrieved documents as untrusted instructions; existing scoped, read-only model execution remains in place.

Published content already has a SHA-256 digest. Readers now check both local and remote bytes against that digest. A verified remote copy can recover a corrupt local copy; unmatched bytes are not served. This does not block publication for editorial imperfections and does not require SHA-512 for larger files. A digest cannot protect against an attacker who can replace both the content and its trusted metadata.

## Read state and product measurement

Authorized visible report opens record read history independently of credits, including free older reports. The marker does not charge or bypass an access check. Existing paid-read history is retained.

After analytics consent, product engagement records a random session ID, an event ID, menu category, UTC start/end and visible duration. Hidden-tab time is excluded. Updates every 30 seconds and on hide/navigation are idempotent. Abrupt browser termination can lose the final interval; these are approximate engagement observations, not billing records. Onboarding interest selection, onboarding completion and plan opening are separate milestones. No question text, query strings or full URLs are collected.

The admin engagement table summarizes these events in the selected time window. Its rows are not segmented by the older channel/plan filters. New collection excludes administrators, recognized test user agents and principal IDs in `STOCKSEMBLY_ANALYTICS_EXCLUDED_PRINCIPALS` (comma-separated). Browser traffic can spoof telemetry, so revenue/conversion truth must continue to come from authenticated account and payment records. Consent refusal and blockers cause undercounting. Anonymous sessions are not retroactively attributed to an account.

## Preparation and outcome measurement

Scheduled preparation refresh is removed at the user's request. Workers only process explicitly queued preparation, including the existing onboarding interest selection flow. There is no periodic active-subscriber scan or daily automatic refresh budget. Existing cache reuse, waiting for in-progress preparation and expired-preparation fallback remain unchanged.

`collection_cache_summary` logs source-cache hits/misses and collection duration per preparation/research collection. Compare the same symbol, target and freshness window before claiming saved minutes. A cached source is not a cached answer to the user's question.

The worker metrics publisher adds 24-hour request, completed, limited-publication, failed/incomplete and cancelled counts. Cohorts use run creation time: newly admitted runs may still be in progress. Do not divide failures by all requests and call the remainder a success rate. Show in-progress and limited publications separately; compare terminal outcomes on mature cohorts. Metrics reach CloudWatch only after deploying the updated worker metrics script.

## Scaling criteria and capacity limits

No instance count or AWS policy is changed by this patch. Existing provisioning code defines web CPU target tracking at 35%, five-minute warmup and capacity capped at one. A capped group cannot scale out even when CPU is high.

Before enabling a maximum above one, verify shared persistence, session behavior, target health and rolling deployment, then use a browser load generator with sufficient CPU/network capacity. Observe ALB latency/error rate and Node event-loop delay alongside CPU. On a multi-vCPU host, average CPU alone can hide a single saturated Node process. Calibrate request-rate thresholds from measured capacity, not a guessed visitors-per-instance value.

Worker scale-out candidate: oldest queued research over 120 seconds and queued runs greater than available worker slots for three consecutive one-minute samples. Validate job claiming, per-run concurrency and API rate limits first. Scale-in requires ten minutes without queued work and graceful draining of active leases. These are initial observation criteria, not active scaling actions; do not terminate a worker with active work. Start with one instance and an explicitly approved maximum/cost cap when activation is requested.

## Incident workflow

Use the Production incident GitHub issue template. Record impact and UTC timeline, deployment SHA, Sentry link, anonymized run IDs, confirmed cause, mitigation, corrective PR and verification. Separate provider errors, admission errors, corrupt artifacts, limited publications and hard failures. Close only after the affected path works and its monitoring is understood. Never copy credentials or private user prompts into public issues.

## Landing browser measurements

`node scripts/performance/landing-browsers.mjs URL COUNT OUTPUT.json` starts isolated logged-out Chromium contexts behind one navigation barrier. It measures response status, first contentful paint, LCP candidate and load timing, and records browser errors. LCP is sampled after a five-second observation window; it is not a real-user field metric or proof that the office is interactive. Set `ALLOW_PRODUCTION_LOAD=1` for non-loopback targets. Default count is two; production load and paid generator provisioning require separate scheduling. Run on a US generator for a US-origin measurement and record generator location, browser version, CPU and network alongside output. No claim of 50 US browsers is made by a two-context local smoke run.

## Rollout

Apply account migration 018 before accepting engagement writes (normal account-store initialization performs migrations). Deploy web and worker changes together, refresh the installed CloudWatch script, then verify one authorized free read, one preparation reuse and one consented engagement event. No login lockout or administrator-role redesign is included. Meta account recovery, ad budget and campaign launch remain account-owner decisions; this patch prepares measurement but does not create accounts or buy ads.

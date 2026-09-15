# Onboarding research preparation

## Contract

Require one to three searchable stocks before continuing onboarding. Next must
atomically persist the selection and enqueue stock preparation, without waiting
for upstream collection. Repeated submissions and different users selecting the
same stock share a job. Preparation never creates a report or consumes credits.

## Implementation sequence

1. Add account interests and PostgreSQL preparation jobs with leases, bounded
   retries and a one-time onboarding submission budget.
2. Prepare the existing collection's public source caches and news classification
   ledger in the worker. Keep questions, research briefs, snapshot IDs and report
   artifacts private to the eventual research run. Share SEC/provider response
   caches across workers; preserve each adapter's freshness policy.
3. Join an existing preparation from initial collection. Report waiting progress,
   refresh stale families, and fall back to ordinary collection after a failed,
   abandoned or excessively long preparation. Never fail publication because an
   optional prefetch failed.
4. Add the stock picker and immediate Next submission. Merge interests into a
   paid subscriber's briefing watchlist without overwriting existing choices.
5. Check boundary/concurrency behavior and exercise onboarding in a browser.

## Freshness and resource policy

- Preparation is a one-time onboarding action, not a periodic free-user refresh.
- Share a stock preparation for 15 minutes; this is a scheduling/deduplication
  window, not permission to treat every underlying datum as fresh for 15 minutes.
- Existing adapters independently refresh quotes (15 seconds), intraday candles
  (5 minutes), news (15 minutes), SEC submissions (1 hour), company facts
  (6 hours), company profiles (24 hours) and immutable filing documents.
- Reuse AI news classifications by candidate and classifier version. Run the
  question-dependent AI brief only after an actual research request.
- Start background preparation only while no real research is queued/running;
  an already-running preparation can finish when a research request joins it.
- One global background preparation at a time; heartbeat/fencing prevent stale
  workers from marking replacement work complete. All jobs have bounded retries.

## Validation record

Implementation and local verification completed after resuming. The historical pause record below is retained for traceability. Production deployment has not been performed.

## Paused at user request — 2026-09-15 16:23 KST

The user requested finishing or pausing within five minutes before leaving.
This is an implementation checkpoint, **not a completed or production-verified feature**.

### Workspace

- Branch: `codex/onboarding-prefetch`, based on main `61efb45`.
- Worktree: `/Users/minsikchae/projects/Stocksembly-onboarding-prefetch`.
- Original `/Users/minsikchae/projects/Stocksembly` has unrelated dirty work; leave it alone.
- No commit, push, PR, migration against production, or deployment performed.
- Development servers on ports 3191/3192 were stopped at this checkpoint.

### Implemented

- Required searchable stock picker (1–3), all eight interface languages, duplicate
  prevention, save retries, and restoration of a previously accepted selection.
- Authenticated interests GET/POST API and server-side completion prerequisite.
- Public account migration 17 for interests; research migration 4 for preparation
  jobs and shared response cache.
- Atomic interests/job insertion; one-time onboarding budget; global stock
  deduplication; background priority below active/queued research.
- Worker preparation through the existing collector with a nonpersisting artifact
  sink. No report creation or research-credit charge. Underlying source caches and
  existing AI news classification ledger are reused.
- PostgreSQL-backed SEC/provider cache sharing, retaining source timestamps and
  each adapter's TTL. Local cache hits are also copied to the shared cache.
- Initial collection waits on an already-running preparation and emits progress;
  queued/failed/stale preparation falls back to ordinary collection. Waiting is
  abortable and bounded, with activity callbacks to prevent false idle detection.
- Preparation heartbeat, token fencing, at most two attempts, ten-minute operation
  cancellation, twelve-minute maximum join wait and shutdown cancellation.
- One-time paid briefing watchlist merge, preserving existing items and plan limits;
  later manual removal does not re-add an onboarding stock.

### Verified

- Application TypeScript check: passed.
- Research-worker TypeScript check: passed.
- Five focused test files / ten tests: passed (picker, prior onboarding steps,
  concurrent queue insertion/claiming, stale completion fencing, join completion,
  fallback/cancellation, retries, cross-worker response cache, paid watchlist merge).
- Expanded seven-file run: 35 passed, one failed in the pre-existing
  `initialCollectionHandler.test.ts:322` exact upstream-call expectation (17 vs 18).
  An isolated unmodified main checkout at `/private/tmp/stocksembly-prefetch-baseline-61efb45`
  reproduced the same failure (8 passed / 1 failed). Do not silently change the
  expected count without identifying the extra request.
- Biome formatting applied to touched files; no errors in that pass, some existing
  style warnings and new non-null-assertion warnings remain to review.
- `git diff --check` passed before this checkpoint.
- Durable local logs: `.stocksembly-verification/onboarding-qa/`.

### Resume first

1. Finish browser QA. The real modal renders the initial stock step, but the input
   stayed disabled (`restoring=true` or hydration not complete); no interests GET
   was observed in captured browser network events. Investigate hydration versus
   `currentAuthTokens()`/restore effect before claiming the UI works. Both the QA
   proxy and direct Next development URL showed this state. Unit tests pass.
2. Local QA harness is saved at `.stocksembly-verification/onboarding-qa/server.mjs`.
   It creates a disposable PostgreSQL fixture, real ResearchApi/account store and
   queue repositories; ticker data and 45-second preparation completion are
   **fixtures**, not live provider calls. The temporary Next page was moved to
   `.stocksembly-verification/onboarding-qa/page.fixture.tsx`; restore it only for
   QA and remove it from app/ before shipping. Next starts with
   `pnpm exec next dev --webpack -p 3191`; harness is on 3192. The proxy rejects
   WebSocket upgrade forwarding, so separate that harness issue from app defects.
   Root `/` without DB configuration fails server rendering; use the temporary
   `/dev/onboarding-prefetch-qa` page for isolated UI validation.
3. Add/execute a focused real API-auth + worker-composition test (current tests
   exercise repository behavior but not the full worker factory) and test restored
   stock selection. Review multi-symbol enqueue lock order to avoid inverse-order
   transaction deadlocks, and pending-job transitions when research starts.
4. Verify account migration/webhook integration and production build/worker build.
   No production latency reduction has been measured. Do not describe fixture
   delays as measured preparation speed or claim all pre-research processing is
   skipped: question-specific briefs, fresh quotes and run-bound packaging remain.
5. Recheck diff, update this record, and report completion only after the actual
   browser flow works. User has not requested a PR for this feature yet.


## Resumed verification — 2026-09-15 17:43 KST

All five implementation steps are complete locally.

- Sorted multi-symbol queue inserts to keep concurrent transaction lock order consistent.
- Added worker-composition coverage: two workers share one collection, research joins
  its completion, no research run is created, and shutdown aborts collection into
  a bounded retry. Propagated the actual research cancellation signal to adapters.
- Six focused test files / twelve tests pass with the worktree's own frozen-lockfile
  dependencies. The earlier shared node_modules symlink lacked sharp; it was replaced
  with an independent install without changing the lockfile or another worktree.
- `pnpm build` passes: office assets, research worker, briefing worker, Next production
  compilation/typecheck and standalone packaging. Local Node is 24.19.0; the repository
  declares Node 20, so CI remains the supported-runtime confirmation.
- Chrome manual QA used the actual Next component, real authenticated ResearchApi,
  account store and disposable PostgreSQL. Observed zero-selection Next disabled,
  successful NVDA/AAPL/MSFT search and selection, fourth selection disabled, Next
  advancing immediately after acceptance, and one running plus two queued jobs.
- A live HTTP join to the fixture job returned `ready`, one waiting notification,
  and 38,036 ms elapsed. This demonstrates waiting for an existing operation, not
  real upstream speed: external collection was deliberately simulated for 45 seconds.
- Reload restored all three persisted stocks. A 390×844 mobile viewport retained
  readable copy, chips and the Next button without horizontal overflow.
- The original QA reverse proxy did not initialize the development page correctly.
  Direct Next navigation with temporary beforeFiles API rewrites resolved the harness
  issue. Those rewrites and the temporary preview route have been removed. No layout
  or development instrumentation change is included in the feature.
- Local QA servers were stopped and their disposable database was closed. No
  production migrations, deployment, commit, push or PR were performed.
- The previously reproduced baseline upstream-call-count test failure remains
  unchanged. No assertions were weakened to hide it.

### Deployment and operational follow-up

Deploy web and worker from the same change so account migration 17 and research
migration 4 are available together. No additional instance is required. Measure
real provider calls, AI usage and preparation/join durations after deployment;
there is no measured production latency claim in this work. Fresh quotes and
question-specific research briefs still run at actual research time.

# Mentoring follow-up implementation

Scope excludes administrator role separation and login protection. Existing dirty worktrees are preserved. No advertising spend, production capacity increase, commit, or deployment is included.

## Plan

1. Inspect and repair server-side research and chat input boundaries; add multilingual regression cases including legitimate security-related investment questions.
2. Separate report reading history from paid entitlement and record successful authorized reads.
3. Reuse content-addressed report integrity checks; repair remote verification/recovery gaps without changing editorial publication rules.
4. Add accessible team guidance and stabilize research-room layout and truthful progress presentation.
5. Add consent-aware visible engagement measurement and operational outcome reporting; document incident handling.
6. Measure preparation cache reuse; document scaling activation criteria and browser-load procedure without increasing production capacity.
7. Run focused checks and real local HTTP/browser QA, record results and limits below.

## Progress

- Completed: shared input validation and multilingual attack/legitimate-query cases; rejected nonempty invalid input no longer becomes an overview.
- Completed: authorized read marker and independent durable read history without credit consumption.
- Completed: local/remote SHA-256 verification and verified-copy fallback.
- Completed: team-specific expandable help, anchored office layout and visible event summary.
- Completed: consent-aware visible-time collection, milestone events, admin aggregation, outcome metrics and incident issue template.
- Completed: cache hit/miss timing, scaling activation criteria and isolated-browser measurement script.
- Removed at user request: scheduled active-subscriber preparation refresh, its five-minute scan and daily budget. Existing onboarding preparation and cache reuse are retained.
- Verification: final local checks below; no cloud changes, deployment, paid model runs or advertising spend.

## Boundaries

Intent filtering is defense in depth, not an authorization boundary. Queries must remain parameterized and tools must retain scoped permissions. Empty research direction remains an explicit company-overview option; nonempty invalid input must not silently become that option. Hashes detect corruption relative to trusted publication metadata and do not authenticate a writer who can replace both content and digest.

## Verification evidence (2026-09-19)

- Node 20.20.2: application typecheck passed; research and briefing worker typechecks/builds passed.
- Optimized Next.js build passed with `next build --webpack`. Default Turbopack build could not resolve this isolated worktree's external node_modules symlink; no application compile failure was found. Deployment uses its own installed dependencies and has not run for this branch.
- Focused regression suites: 40 tests passed across seven files (input safety, PostgreSQL migration/read history/engagement/preparation, preparation worker, read authorization and consent). Five further tests passed for visible-time exclusion/idempotency and model locale prompts.
- Report reader: new corruption/recovery case passed; existing workflow-v2 Q&A test fails because it expects no `details`, while the unchanged UI now renders collapsible answers. The original HEAD test reproduces this failure; its assertion was not weakened.
- Real local HTTP: unsafe report question returned 400; cross-origin engagement returned 403; consented valid engagement returned 204 and inserted a database record.
- Real browser: expanded the financial-team help in light and dark modes; checked the office state caption on a temporary fixture route (removed after QA).
- Two isolated logged-out Chromium contexts reached the local landing with HTTP 200 and no page errors after configuring the disposable PostgreSQL database. This is a smoke check on a local development build, not US production capacity evidence. Results: `/tmp/mentoring-browser-smoke.json`.
- Changed-file Biome check has no errors (existing warning-level recommendations remain). JavaScript syntax and Git whitespace checks passed.

## Delivery state

Branch: `codex/mentoring-security-experience`, based on `a07067d81b6f3975ae766c71f7215849d210015d`. Changes are uncommitted and unpushed. The original worktree and its unrelated changes are untouched.

Production migration/deployment, live CloudWatch script installation and live paid-model regression are not performed. Actual autoscaling activation and paid/remote load generators remain separately controlled operations. No admin role separation or login-protection changes were made.

## Scheduled refresh removal follow-up

Removed the automatic subscriber refresh function, worker timer and budget configuration at the user’s request. Updated the integration fixture to directly seed an expired preparation, retaining that freshness regression check. The onboarding/preparation worker and related integration suites passed: 3 files, 8 tests. Initial test connection failure was resolved by starting the disposable PostgreSQL instance on the required port 55432. No production changes were made.

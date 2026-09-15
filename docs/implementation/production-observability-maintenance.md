# Production observability and maintenance

## Implementation plan

1. Correct unmatched route status before streaming begins. Preserve localized pages, API routes, and Apple Pay verification.
2. Add privacy-restricted Sentry browser/server/worker instrumentation with 10% performance sampling and no replay. Keep it disabled without a configured DSN. Use the core SDKs to avoid the Next.js build plugin's dependency trust downgrade.
3. Schedule daily Docker maintenance with deployment locks, seven-day cache retention, and explicit rollback image protection. Never prune volumes or retained containers. Bound logs on newly created runtime containers.
4. Verify local HTTP behavior, telemetry redaction/delivery, and production disk changes. Record deployment requirements and remaining account configuration.

## Implemented behavior

### HTTP status

The root `app/loading.tsx` streamed a loading response before the invalid locale parameter raised `notFound()`, so a rendered 404 document arrived with HTTP 200. Removing that global loading boundary allows the status to be decided first. Existing research-specific loading boundaries remain. Locale parameters are bounded to supported languages; a global not-found document handles unmatched routes without the application layout. No environment file content was exposed by the observed response.

Local production-build checks with the isolated PostgreSQL database: `/.env`, `/no-such-route-apm-check`, `/foo/bar`, and `/api/no-such-route` return 404; `/ko` and the Apple Pay association file return 200. The root loading skeleton no longer flushes early; successful root pages wait for server preparation before sending their HTML.

### Sentry

Project: `https://plutia-0b.sentry.io/projects/stocksembly/`. The existing organization is Plutia; no organization or paid subscription was renamed or purchased. GitHub Actions variable `SENTRY_DSN` configures the web build and web/worker runtime on deployment. The browser public DSN is an ingestion address, not a management token. Runtime release uses the deployed Git SHA; web bootstrap persistence carries runtime configuration to replacement instances.

Browser SDK records errors and sampled navigation/request timing. Node SDK initializes before worker imports, instruments PostgreSQL/HTTP, and the Next instrumentation hook reports server errors. Worker attempts have an explicit span and run/job tags; incomplete outcomes are reported separately. Performance sampling is 10%; replay and model-content integrations are not enabled. Request data, user details, breadcrumbs, SQL statements, span payloads and error messages are removed. Stack locations, operation timings and coarse route categories are retained. The core SDK integration does not upload source maps; minified browser stack readability is a remaining limitation.

The Next.js convenience package hit the existing pnpm trust policy for an indirect `semver` dependency. The policy was preserved; core browser and Node SDK packages installed successfully instead.

A synthetic local error was received and visibly verified as `STOCKSEMBLY-1` in Sentry, event `dd18345072b24c5f947072ab5a609dfa`, with redacted message. Privacy tests verify removal of request credentials, question content, SQL and local variables without losing timing or stack location.

### Docker maintenance

Both current web and worker hosts have `stocksembly-docker-maintenance.timer` enabled. It runs daily at 19:00 UTC (04:00 KST), with up to 30 minutes of jitter and missed-run catch-up. It shares both deployment locks, removes unused build cache older than seven days, and attempts to remove old Stocksembly images only when no container references them and no rollback record protects them. No volumes or containers are pruned. Docker may retain shared cache storage beyond the requested 2GB; this is not a hard disk quota.

An initial, supervised cache-only cleanup used a 24-hour threshold. Docker reported 18.99GB reclaimed on worker (cache approximately 20.07GB to 1.37GB), and 636.9MB on web. Shared image/cache accounting is not equivalent to unique filesystem bytes. Both containers remained running throughout. The web's previous image `web-sha-5162c0845805481d5f0538ee965cc86d7966417d` is explicitly protected.

On subsequent role deployments, the previous image is recorded for rollback. New runtime containers use Docker's rotating local log driver, at 10MB per file and three files. Existing containers were not restarted just to change log drivers. CI installs maintenance on deployed hosts and publishes the same scripts for new ASG instances.

## Rollout and limits

Server maintenance and the Sentry project/Actions variable are already configured. Application changes, the log-driver setting and bootstrap script updates require the normal reviewed PR deployment. No production application image was replaced in this task. After rollout, confirm a production Sentry request and its release, and repeat the public HTTP status checks. No load test was run.

## Final verification notes

Sentry's Traces UI displayed the actual PostgreSQL check and its `research.attempt` parent, including DB durations with descriptions reduced to `db`. Verified trace `34a0f9289e8246ea9ed3f3c280c83326` had a 10.67ms parent and a 0.77ms query span. The synthetic diagnostic process forced sampling only for that check; application defaults remain 10%.

Next production build, worker typecheck/build, packaged worker module imports, two telemetry privacy tests and syntax checks for all 25 workflow shell blocks passed. The existing localized metadata test could not load its suite because its unmocked server dependency imports `server-only`, which Vitest cannot resolve in this worktree. This is recorded rather than disabling the test. Actual localized HTTP responses were verified with the local PostgreSQL configuration.

The installed maintenance service completed an actual invocation with `Result=success` and `ExecMainStatus=0`. Worker filesystem usage fell from approximately 27GB to 15GB (53% to 30%); Docker's larger reclaimed-cache figure includes shared accounting. The worker stayed running. Final web build/standalone packaging and packaged worker startup imports passed. The changes are prepared on `codex/research-event-notifications`, alongside the previously requested event-notification work. Production application rollout remains pending PR merge and deployment.

## Email alerts

The Stocksembly error monitor has a connected email alert for new issues, escalations, and resolved issues that regress. It targets the account owner explicitly, using the verified primary email and enabled Email delivery channel. Action throttle is 60 minutes. Sentry confirmed test notification dispatch and alert creation. Alert: `https://plutia-0b.sentry.io/monitors/alerts/3994710/`. Inbox delivery was not independently verified.

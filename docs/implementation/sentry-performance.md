# Sentry performance monitoring

The existing Stocksembly Sentry project receives browser errors and page-load traces, server request traces, and research worker attempt traces. This change adds Node CPU profiles and application metrics to the existing SDK integration. It does not enable session replay or send research prompts, SQL text, credentials, or request bodies.

## Metrics

| Metric | Meaning | Collection |
| --- | --- | --- |
| `process.memory.rss` / `process.memory.heap_used` | Process memory, bytes | Every 60 seconds per process |
| `process.cpu.utilization` | CPU time / elapsed time; 1 means one fully used CPU core | Every 60 seconds |
| `process.event_loop.delay.p99` | 99th percentile event-loop scheduling delay, milliseconds | Previous 60-second window |
| `db.pool.connections` / `idle` / `waiting` / `limit` | Open/idle connections, queued acquisitions, configured pool maximum | Every 60 seconds per pool |
| `db.pool.acquisitions` / `acquire.failures` | Connection acquisition and failure counts | Aggregated locally over 60 seconds |
| `db.pool.acquire.mean` / `acquire.max` | Acquisition duration including password-rotation retries, milliseconds | Previous 60-second window |
| `research.attempt.duration` | Handler execution duration, milliseconds, including failed handlers | Once per attempt |
| `research.attempt.outcome` | Workflow attempt outcome, not necessarily a published report | Once per handled outcome |

Runtime attributes distinguish `web` and `worker`. Pool attributes distinguish `accounts` and `research`. Outcome attributes use a fixed allowlist. User IDs, ticker symbols, run IDs, emails and question text are not metric dimensions. Release/environment and SDK identity are preserved for filtering.

Pool observation does not query PostgreSQL. Timers are unreferenced, start after the first observed acquisition, and stop after pool shutdown or metrics disablement. Short-lived processes may exit before an interval sample is sent. Pool waiting is a periodic snapshot, so acquisition mean/max and failures also matter for short bursts. These are process/pool measurements, not the RDS server-wide connection count. With multiple instances, use average/max for saturation and consult CloudWatch for fleet/RDS totals.

## Profiles and sampling

`@sentry/node`, `@sentry/browser`, and `@sentry/profiling-node` are pinned to the same version. Standalone packaging copies the profiler and its native dependency for both web and worker artifacts. CPU profiles show JavaScript execution stacks; time waiting for external AI providers is diagnosed using traces, not CPU samples.

| GitHub Actions repository variable / runtime environment variable | Default | Effect |
| --- | --- | --- |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Server trace sampling, 10% |
| `SENTRY_PROFILE_SESSION_SAMPLE_RATE` | `1` | Process-session eligibility for profiling |
| `SENTRY_METRICS_ENABLED` | `true` | Enable bounded custom metrics; `false` disables them |

Profiling uses the SDK's `trace` lifecycle: it runs while a sampled span is active. Session sampling is evaluated once per process startup, **not per request**. Setting it to 0 disables profiling; setting it to 0.1 could leave a long-lived server without profiles until its next restart. For predictable coverage on the current small fleet, keep session eligibility at 1 and adjust trace sampling. Long-running sampled worker attempts can produce long profiles; 10% trace sampling is not a guaranteed 10% CPU overhead or a billing cap. Check Sentry ingestion and plan quotas after production rollout before increasing sampling. Error sampling remains unchanged.

The deployment workflow writes these settings alongside the DSN and release SHA. Defaults work without adding repository variables. A normal PR merge/deploy is required to apply the new SDK code; console configuration alone cannot instrument running containers.

## Verification

Run using Node 20 with a valid Sentry DSN:

```sh
pnpm exec vite build --config vite.worker.config.ts --ssr scripts/verify-sentry-performance.ts --outDir .stocksembly-verification/sentry-smoke
node .stocksembly-verification/sentry-smoke/verify-sentry-performance.js web
node .stocksembly-verification/sentry-smoke/verify-sentry-performance.js worker
```

The diagnostic explicitly uses `environment=verification`, 100% sampling, a 300 ms CPU workload, and one 60-second runtime sample. It makes no research/model/payment requests. `flushed: true` means SDK transport queues drained; separately check Sentry Explore → Metrics and Profiles, filtered to `verification`, to confirm ingestion. These diagnostic events are not production workload measurements.

In production, use Explore → Traces for slow requests/DB spans and Profiles for function-level CPU hotspots. Metrics should be filtered to `production`; compare pool waiting and acquisition failures with event-loop delay and memory before adjusting connection limits. Existing error alerts continue independently. Browser page-load tracing remains enabled; browser CPU profiling is not enabled.

## Verified on 2026-09-23

- Node 20 web and worker production builds passed. The standalone artifact loads the native profiler; the Linux x64 glibc Node 20 binary is included.
- Privacy, sampling and pool-observation tests: 11 passed. Type checking passed.
- The verification driver sent transactions, `profile_chunk`, and `trace_metric` envelopes; Sentry returned HTTP 200 without rate limiting.
- Sentry Profiles displayed `/` (300.89 ms) and `research.attempt` (301.87 ms) from the diagnostic workload.
- Sentry Metrics displayed six metric names: CPU utilization, event-loop p99, RSS, heap use, attempt duration, and attempt outcome. Web and worker attributes were both visible. Initial indexing took several minutes.
- Saved and starred **Stocksembly CPU by runtime** (saved query ID `2454039`), using average rather than sum for CPU utilization. It includes all environments; select `production` after deployment to exclude diagnostic data.
- DB pool behavior was covered by focused tests. Production DB pool telemetry still requires deployment and subsequent traffic; no live production connection limits or workloads were changed.

[Open Sentry metrics](https://plutia-0b.sentry.io/explore/metrics/?project=4512090648543232) · [Open profiles](https://plutia-0b.sentry.io/explore/profiles/?project=4512090648543232)

## Production console configuration (2026-09-23)

- Existing email alert `3994710` now filters `production`, retains its 60-minute throttle and existing recipient. Development/verification events do not trigger it.
- [DB connection failure monitor](https://plutia-0b.sentry.io/monitors/10420622/) is enabled: sum of `db.pool.acquire.failures` over five minutes, high priority above zero, resolves at zero. It is restricted to production and connected to the existing email alert. It becomes useful after the instrumented build is deployed; no production failure was injected to test notifications.
- [Backend Overview](https://plutia-0b.sentry.io/dashboard/10110122/) has production saved as the default environment for everyone. No speculative latency threshold was added.
- The optional verification driver `worker --pool` exercises an actual loopback connection refusal. Sentry accepted its envelopes and listed all eight DB pool metric names. This does not use production DB credentials or open production connections.
- Billing showed Business trial with six days remaining, no payment method, and $0 additional spend. The trial quotas are not permanent free-tier allowances. Project spike protection is enabled. No upgrade or spending increase was made; check feature availability when the trial ends.

## Private source maps

Production Docker builds enable server/browser/worker source maps. `scripts/upload-sentry-sourcemaps.mjs` injects debug IDs into the exact packaged JavaScript, uploads validated maps to `plutia-0b/stocksembly`, and removes the packaged maps before runtime image creation. Next standalone tracing omits some server maps; only maps for shipped JavaScript are copied before upload.

The GitHub repository secret `SENTRY_AUTH_TOKEN` must contain an organization CI token (`org:ci`). Pass it with a BuildKit secret, never a Docker build argument or committed environment file. Normal production image builds require this secret and stop before pushing an image if upload fails. Local builds default to source maps disabled. Release identity uses the commit SHA in server configuration and the browser bundle.

Verified 2026-09-23: created the user-approved organization token `Stocksembly GitHub source maps` with `org:ci` scope and installed it as the repository Actions secret `SENTRY_AUTH_TOKEN`. Actual CLI uploads passed validation and completed for 953 web maps and 91 worker maps. Packaged runtime roots contain zero remaining `.map` files after upload. The temporary local credential file was removed. Web/worker builds, type checking and deployment shell syntax passed. Automatic production uploads begin after this branch is merged and deployed; the current production containers were not changed.

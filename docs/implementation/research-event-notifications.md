# Research progress notifications

## Behavior

Research event inserts and run status changes send a PostgreSQL notification on `stocksembly_run_events`. A trigger publishes only the run UUID, and PostgreSQL delivers it after transaction commit. The durable event log remains authoritative; no report text or private payload travels through the notification channel.

Each web API instance maintains one checked-out LISTEN connection while progress viewers exist. Incoming notifications invalidate that run's short-lived read cache and wake its SSE connections. Each read still scopes the run to the requesting principal and resumes from the connection's last sequence. Identical principal/run/cursor reads share an in-flight promise and a 250 ms result window, capped at 256 entries. Different principals do not share cached authorization or snapshots.

The existing SSE transport and reconnect cursor remain unchanged. Idle heartbeats are emitted every 15 seconds without querying the database. Missing notifications are recovered by a 30-second fallback read. LISTEN errors trigger reconnect attempts with exponential backoff from one to 30 seconds; successful reconnection immediately wakes active runs to recover missed events. Closing the last viewer releases the listener connection. Stream cancellation and snapshot errors release subscriptions without cancelling research.

## Deployment

Apply research migration `005_run_event_notifications.sql` through the existing migration runner. Web code uses the existing PostgreSQL pool and needs a session-capable connection (the current direct RDS connection), not transaction-pooling middleware for LISTEN. No Redis, new instance, or browser protocol change is required. Each active web API instance reserves one pool connection for LISTEN.

Deploying web code before the migration remains functional through the 30-second fallback but will not provide immediate notifications. The migration is additive and can remain installed if the web code is rolled back. No production configuration or data was modified during local implementation.

## Validation

- Existing SSE tests cover ordered replay, reconnect cursors, authorization, internal event filtering, transaction commit visibility, heartbeat, termination, abort and backpressure.
- Real PostgreSQL tests verify that rollback does not notify, different runs remain isolated, one LISTEN connection serves multiple watchers, and terminating that connection causes successful reconnect and continued delivery.
- Twenty concurrent identical reads acquire one database connection; another principal performs a separate read, and notification invalidation forces a fresh read.
- A missed-notification test verifies zero idle reads before 30 seconds while maintaining the 15-second heartbeat, followed by terminal status recovery.

This is functional verification, not a production load benchmark. Idle snapshot cadence changes from once per second to once per 30 seconds per active connection, before read sharing; active event traffic still requires database reads.

## Live execution environment (2026-09-15)

A single NVDA committee run was submitted through a local HTTP adapter using the production `createResearchApi` and the real worker, isolated in `stocksembly_events_live_test` on loopback PostgreSQL. The adapter disables billing only for this local test and uses real data providers and model calls; it is not committed. No production research was created.

The Mac's ChatGPT-bundled Codex had updated to 0.153.4 while repository pins still referenced 0.153.1. The new binary passed `codesign --verify --strict`, retained team identifier `2DC432GLL2`, and its SHA-256 and code-directory hash were recorded in the macOS pins. Linux pins remain unchanged. Readiness admission then passed.

The first collection attempt stopped because the isolated data directory lacked SEC identity configuration. After copying the existing local SEC configuration, the same run was resumed through the public retry endpoint (no extra research request). The SSE client disconnected and resumed from its cursor without duplicates; the API maintained one LISTEN connection.

Additional readiness tests: 35 passed; one pre-existing evidence-inventory test could not run because the ignored `.omo/evidence/start-work/live-research-office/task-21/hashes.log` is absent in this worktree. No test or isolation gate was disabled.

### Live result

Run `1a61d115-0beb-45f1-9c40-a47677196bf9` published report `62448286-3b08-4b2d-890d-8899d9e04964` at 13:18:04 UTC. Final status was `complete-with-limitations`, not failure. The authenticated report endpoint returned HTTP 200 with a nonempty report (90,597 characters). Elapsed time was approximately 15 minutes after the same-run retry.

The cursor client reached final sequence 80, including `report_published`, with no duplicate sequence after intentional disconnect/reconnect. Across 37 live public events (excluding initial replay), recorded-event-to-client delay had median 26 ms, p95 208 ms, and maximum 265 ms. These local timings include transaction and scheduling delay and are not production latency guarantees. A separate idle stream received its heartbeat after 15,034 ms. The listener count returned to zero after streams closed.

Publication retained content-review and evidence-reconciliation limitations; the weekly chart was partial, while hourly, four-hourly, and daily charts were ready. This verifies notification delivery and eventual report retrieval, not unrestricted research quality or a guarantee against all failures. Local proof files remain under `/tmp/stocksembly-events-live-0915`.

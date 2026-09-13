# PostgreSQL-only database migration

## Current scope

The user explicitly deferred web/worker machine separation. This implementation replaces SQLite with PostgreSQL across research runtime, local development, tests, packaging, and DB utilities. It reuses the existing account/RDS configuration. Web and worker remain on the existing host; artifact files remain at their existing locations. S3-wide artifact relocation, SQS redesign, a load balancer, and additional instances are excluded from this release.

The filename retains the original planning path for continuity. It does not mean separate-host deployment is complete or included. Implementation is isolated in `codex/postgres-only-split-runtime`, originally based on main `36ddf24`; unrelated changes in the original checkout are preserved.

## Implementation and status

| Workstream | Status | Result or remaining boundary |
| --- | --- | --- |
| Shared PostgreSQL configuration and migrations | Implemented | Reuses URL/RDS secret configuration, verified TLS and credential rotation; transactions use a checked-out connection, migrations use version/checksum validation and advisory locking. |
| Research persistence and asynchronous callers | Implemented and verified locally | PostgreSQL repositories and asynchronous API, workflow, publication, recovery, localization, catalog, and worker paths replace SQLite access. |
| Worker ownership and local/CI runtime | Implemented | PostgreSQL advisory ownership replaces the local DB lease; real PostgreSQL fixtures and CI service replace SQLite tests; standalone packages `pg` and migrations. No machine split. |
| Historical export/import | Implemented and rehearsed locally | Read-only version-32 exporter and transactional PostgreSQL importer validate hashes, rows, relationships, and event sequences. Production unchanged. |
| Production cutover | Not executed | Requires final drain/export, RDS import and ownership reconciliation, explicit readiness marker, and protected PR deployment. See the operational runbook. |

## Preserved contracts

- Research job claims use database locking/fencing; old lease owners cannot accept new commits after replacement.
- Event sequence allocation, replacement ancestry, call budgets, idempotency, cancellation, and same-snapshot recovery remain durable.
- Report metadata, final run state, and publication events remain transactional. Account ownership and credit effects must be checked during release validation.
- Serialized JSON and canonical timestamp text retain the bytes used by existing digests. Numeric imports preserve integer precision.
- The application has no silent local fallback. Production refuses to open the new research store unless `STOCKSEMBLY_RESEARCH_POSTGRES_READY=true` is explicitly configured.
- Existing SQS signaling does not become a new authoritative queue as part of this change. Existing artifact storage does not become cross-host storage merely because metadata moves to RDS.

## Database mapping and transfer

The source is the final SQLite schema at version 32, not the first historical migration. PostgreSQL migrations preserve foreign keys, uniqueness, JSON checks, budget rules, and circular relationships. SQLite-specific type/check syntax is mapped to PostgreSQL constraints. Account tables remain in their existing schema; research uses `research`.

The exporter is a one-time offline Python utility using standard-library SQLite in read-only mode. That is the only intentional legacy SQLite dependency; there is no application/test driver or runtime fallback. It emits table JSONL files, exact row counts, per-file checksums, and a manifest digest. It does not modify the source or production.

The importer requires an empty research destination. It verifies the complete table set, checks archive hashes before and during transfer, validates stored values and row counts, checks foreign keys, and reconciles event sequence high-water marks. Temporary user-trigger/constraint changes are enclosed in the same import transaction and restored before commit. Default execution rolls back. `--commit` requires the reviewed manifest SHA-256; successful imports receive a durable receipt.

A local rehearsal of a production copy covered **34 business tables, 74,936 rows, 87 runs, and 63 reports**, with **3 target migrations**. Source version: **32**. Manifest SHA-256: `be20eb10fd837f670b3b215b07583c62f92efddbe1910e8329e5888e7520449d`. These are rehearsal results, not a claim of an RDS production switch. A final export must be taken after writers are drained and stopped.

## Verification record and remaining release checks

Completed evidence from this work:

- Shared configuration/transaction foundation was exercised on real local PostgreSQL 16, including rollback, concurrent migration startup, event sequencing, competing leases, and stale-owner fencing.
- A copied standalone package completed the PostgreSQL runtime probe against the local server.
- Worker entry error-handling tests and deployment shell checks passed during the packaging conversion.
- Historical data transfer was rehearsed locally using the counts and digest above. Read-only application-reader verification loaded 87 runs, 63 reports, and 2,849 events from that rehearsal.
- The build, 180 focused contracts, and deterministic quality checks passed. Full packaged lifecycle verification remains limited by the pre-existing installed Codex 0.153.4 versus repository pin 0.153.1 mismatch; the binary pin was not changed.

Focused persistence/worker checks, TypeScript, build, and historical application-reader checks have been run on this implementation. Existing workflow/application fixture failures and the baseline architecture scan remain unchanged; their comparison logs are recorded in the local verification artifacts. Production historical-report and new/recovered-run checks remain part of cutover, after the final import. No additional paid research was generated for this storage migration.

Production remains a separate controlled step: preserve backups, drain writers, export the final snapshot, rehearse and commit into RDS, verify account ownership/credits and artifacts, then set the readiness marker and deploy through protected main. After PostgreSQL accepts new writes, restarting against the old SQLite backup would lose those writes; rollback requires reconciliation.

## Operational entry points

- [Shared DB setup](../../src/server/database/README.md)
- [Cutover and rollback runbook](../operations/postgres-cutover.md)
- [Script inventory](../../scripts/README.md)
- `pnpm db:local:up`, `pnpm db:prepare`, `pnpm db:export-legacy`, `pnpm db:import`, `pnpm db:verify`

No new host, load balancer, or cloud resource is provisioned by this database-only implementation.

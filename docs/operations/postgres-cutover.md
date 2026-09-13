# Research PostgreSQL cutover

## Release boundary

This release replaces the application's SQLite storage with PostgreSQL. Accounts retain the existing RDS account tables; research uses the `research` schema in the same configured database. Web and worker remain on the existing host. Machine separation, additional CDN routes, and moving all artifact reads to S3 are separate work.

Production has **not** been switched by the local migration rehearsal. Do not enable the new release until the final export is reconciled. Both production startup and deployment require `STOCKSEMBLY_RESEARCH_POSTGRES_READY=true`; this is an operator-controlled cutover marker, not a migration command.

## Tools and prerequisites

Use Node 20.20 or later within Node 20, pnpm 10.34.1, Python 3 for the one-time exporter, and PostgreSQL 16 or later. Run commands from the checked-out release root. Supply database configuration securely in the process environment: `STOCKSEMBLY_DATABASE_URL`, or the existing `AWS_REGION`, `STOCKSEMBLY_DB_SECRET_ARN`, and RDS endpoint settings. Remote connections verify TLS using `STOCKSEMBLY_DB_CA_PATH` or the packaged RDS CA bundle. Never put credentials in command history, documentation, or transfer manifests.

The destination must have the existing account records and an empty research dataset. The import role must be able to create/migrate the research schema and alter its triggers/constraints during the transaction. Do not give the ordinary application role broad account-wide AWS privileges for this task.

| Tool | Behavior |
| --- | --- |
| `pnpm db:verify --data-root /backup/artifacts-root` | Builds the read-only verifier and reads all runs, events, and published reports through application readers; data root must contain the existing `artifacts/` directory. |
| `pnpm db:prepare` | Applies ordered, checksum-verified research migrations. Does not import records or enable cutover. |
| `pnpm db:export-legacy --research /backup/research.sqlite --news /backup/news.sqlite --output /backup/final-export` | Reads a consistent legacy snapshot and writes private JSONL files plus a hashed manifest. `--news` is optional when no separate news ledger exists. Output directory must not exist. |
| `pnpm db:import --archive /backup/final-export` | Imports and validates inside a transaction, then rolls back. Default rehearsal mode. |
| `pnpm db:import --archive /backup/final-export --commit --expected-sha256 REVIEWED_HASH` | Commits only the reviewed archive. Refuses a populated destination or inconsistent archive. |

Only the offline Python exporter imports Python's standard-library `sqlite3`; it opens source files read-only. No application, worker, test fixture, or Node dependency uses SQLite. Preserve this small transfer utility while historical backups still need migration.

## Local rehearsal evidence

A production-data copy was rehearsed locally against PostgreSQL, with production unchanged:

- Source schema version: **32**; target migration count: **3**.
- **34 business tables, 74,936 rows, 87 runs, 63 reports**.
- Reviewed manifest SHA-256: `be20eb10fd837f670b3b215b07583c62f92efddbe1910e8329e5888e7520449d`.

Application-reader verification additionally read **87 runs, 63 reports, and 2,849 events** from the local rehearsal database and matching artifacts.

This digest identifies that rehearsal snapshot only. The final production export will have its own digest and counts. Do not reuse the rehearsal hash as an approval for newer data.

The importer checks archive and table hashes, table/column correspondence, returned stored values, row counts, foreign keys, event continuity and high-water marks. It records a committed import receipt in `research.storage_imports`. When account tables exist, it rejects unknown principals or conflicting existing ownership. A production commit requires account tables. These checks do not replace checking actual historical-report access and credit balances after cutover.

## Production sequence

1. **Prepare the release and maintenance window.** Obtain the protected-main PR review. Keep the cutover marker false while reviewing/building; a normal deployment must refuse to stop the old service before import readiness. Save the running image/revision and effective environment securely. Create an RDS recovery snapshot and verify access to the legacy backup and artifact directory.
2. **Stop new writes and drain.** Disable new research requests at the ingress/application boundary. Let active work finish, or record its durable checkpoint and stop the worker cleanly. Stop every legacy writer, including web commands and scheduled tasks. Confirm that nothing can modify research during the final export. Keep the existing artifact files in place; this DB migration does not relocate them.
3. **Export the final snapshot.** Run the read-only exporter against the final consistent backup, including the separate news ledger if present. Record its printed manifest digest and table/row counts. Preserve the source backup, any associated WAL needed for its consistency, and the export outside the application's writable data directory. Transfer through the approved private channel.
4. **Prepare and rehearse RDS import.** Load the existing destination credentials without displaying them. Run `pnpm db:prepare`, then the default rollback import. Review all checks against the final manifest. Verify research principals match the existing account database; preserve account balances and research ownership records. The importer must not be used to overwrite a populated research target.
5. **Commit the reviewed archive.** With writers still stopped, run the commit form using the exact final manifest hash and `NODE_ENV=production`. Save the import receipt. Run `pnpm db:verify --data-root /absolute/path/to/research-data` against RDS and its matching artifact directory; it uses a read-only connection. Compare runs/reports and account ownership, inspect representative historical reports and their artifacts, and check credit balances. Do not set the readiness marker if any check fails.
6. **Enable and deploy the approved release.** Set `STOCKSEMBLY_RESEARCH_POSTGRES_READY=true` in the effective protected environment for both web and worker only after the committed import is verified. Deploy the reviewed PostgreSQL-only image through the protected release workflow, or rerun its previously guarded deployment. The marker must resolve to true in the final environment file order. Verify worker readiness, historical report access, then one new research/recovery path and its credit outcome before reopening requests.
7. **Retain recovery material.** Keep the legacy backup, final archive, import receipt, previous release identifier, and RDS recovery snapshot under the agreed retention policy. Retire active legacy files only after cutover checks pass. Do not reconnect them as an automatic fallback.

If the protected pipeline attempts deployment before step 5, its guard intentionally fails and leaves existing services running. Coordinate the maintenance window and rerun after verified import; do not bypass the guard to make CI green.

## Failure and rollback

An uncommitted import rolls back its rows and temporary constraint/trigger changes. Keep writes disabled, investigate the mismatch, and rerun against the reviewed source. A repeated committed manifest returns `already_imported`; confirm the receipt rather than creating a second copy.

Before any PostgreSQL application writes, rollback can restore the previous runtime against the preserved, consistent legacy data under controlled maintenance. **After PostgreSQL writes begin, the old SQLite copy is stale.** Stop writes and reconcile all new research, ownership, events, and credit effects before deciding to roll back. Prefer repairing the PostgreSQL deployment or restoring/recovering PostgreSQL with an explicit data-loss assessment. Never restart the old binary on the stale database as a quick fallback.

# Shared PostgreSQL utilities

Accounts and research use the same database configuration. Research tables live in the `research` schema; account migrations retain their existing schema and ownership. PostgreSQL 16 or later is required by the research JSON constraints. Application runtime has no SQLite fallback.

| File | Responsibility |
| --- | --- |
| `postgresConfiguration.ts` | URL or existing RDS Secrets Manager configuration, verified TLS, password rotation, and bounded connection pools. Missing configuration is reported to the caller. |
| `postgresTransaction.ts` | One checked-out client per transaction; commit on success, rollback on failure. Callbacks must use that client. Ambiguous external effects are not automatically retried. |
| `postgresMigrations.ts` | Advisory-lock serialization and version/checksum validation for atomic research migrations. |
| `postgres.integration.test.ts` | Real PostgreSQL migration, rollback, sequencing, and lease-fencing checks. |

The research pool and migrations live in `src/research/server/persistence/postgres/`. Production requires `STOCKSEMBLY_RESEARCH_POSTGRES_READY=true` before opening the research store. This prevents an intermediate deployment from silently starting a new empty dataset while legacy records remain unmigrated. See [the cutover runbook](../../../docs/operations/postgres-cutover.md).

## Local setup

Use the repository's PostgreSQL 16 Compose service:

```sh
pnpm db:local:up
```

Set this URL in the untracked `.env.local` for local web/worker use:

```dotenv
STOCKSEMBLY_DATABASE_URL=postgresql://stocksembly:stocksembly_local@127.0.0.1:5432/stocksembly
```

`pnpm db:prepare` loads `.env.local` and prepares research migrations. A local production build also requires `STOCKSEMBLY_RESEARCH_POSTGRES_READY=true` after local DB preparation. That local setting is not permission to switch production. The Compose port is loopback-only and its named volume persists across `pnpm db:local:stop`. Do not remove the volume unless its data is intentionally disposable.

An existing local PostgreSQL 16 installation is equally valid. The migration development environment uses port `55432`; the Compose example uses `5432`. Match the URL to the actual server instead of running two instances on the same port.

## Integration tests

Create a separate disposable database with a name ending in `_test`:

```sh
docker compose -f compose.postgres.yaml exec postgres createdb -U stocksembly stocksembly_test
STOCKSEMBLY_TEST_DATABASE_URL=postgresql://stocksembly:stocksembly_local@127.0.0.1:5432/stocksembly_test \
  pnpm exec vitest run src/server/database/postgres.integration.test.ts
```

The foundation test replaces the `research` schema in the explicitly selected test database and skips when its test URL is absent. The shared research fixture helper creates and drops its own UUID-named databases using the test connection; that local role needs `CREATEDB`. Its local default is `postgresql://127.0.0.1:55432/stocksembly_migration_test`. Both reject non-loopback or non-test database URLs and query overrides. Neither falls back to production/account configuration.

CI supplies a real PostgreSQL 16 service. Test credentials are local disposable credentials, not deployed RDS credentials. Scope checks to the persistence/concurrency behavior being changed; model-generated reports are not required for ordinary repository tests.

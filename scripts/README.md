# Script entry points and maintenance tools

[Repository guide](../README.md) · [Cleanup record](../docs/repository-cleanup.md)

Database entry points updated for the PostgreSQL-only migration; production cutover is separately controlled. Run commands from the repository root. The project requires Node `>=20.20.0 <21`; CI uses pnpm 10.34.1. Install dependencies with `pnpm install --frozen-lockfile`.

This inventory covers supported script entry points and their test/fixture helpers. It distinguishes direct commands, internal modules, packaged entrypoints, and historical tools. Do not run every file as a maintenance routine.

## Common tasks

| Task | Command | Prerequisites and effects |
| --- | --- | --- |
| Develop the web application | `pnpm dev` | Starts the Next development server |
| Build deployment output | `pnpm build` | Builds both workers and Next; postbuild assembles the standalone package |
| Start the local runtime | `pnpm start:local` | Requires build output; starts web and research worker, using configured PostgreSQL |
| Check types or unit tests | `pnpm typecheck`, `pnpm test` | Scope is defined by TypeScript and Vitest configuration |
| Check research quality contracts | `pnpm research:quality`, `pnpm research:quality:contracts` | Deterministic checks also used by CI |
| Inspect worker readiness | `pnpm research:worker:readiness`, `pnpm research:worker:health` | Requires built worker entrypoints |
| Inspect Codex readiness | `pnpm research:codex:probe` | Requires the local protected execution environment and authentication |
| Configure SEC identity | `pnpm research:configure-sec-identity`, `pnpm research:require-sec-identity` | Configure writes local settings; require checks them |
| Diagnose React code | `pnpm doctor` | Runs external `react-doctor@latest`; not a required CI step |

Local launch no longer synchronizes reports into production. Use isolated PostgreSQL credentials for QA. See [the cutover runbook](../docs/operations/postgres-cutover.md) before handling historical data.

## Database commands and transfer tools

| Command / file | Inputs, effects, and boundary |
| --- | --- |
| `pnpm db:local:up` / `pnpm db:local:stop` | Starts/stops the PostgreSQL 16 Compose service; stop preserves its named volume. |
| `pnpm db:prepare` / [prepare-research-postgres.mjs](migrations/prepare-research-postgres.mjs) | Loads `.env.local` if present and applies ordered, checksum-verified research migrations to the configured PostgreSQL database. Does not enable production cutover. |
| `pnpm db:export-legacy` / [export-legacy-research.py](migrations/export-legacy-research.py) | Python 3, `--research PATH [--news PATH] --output NEW_DIRECTORY`; read-only version-32 legacy export with private JSONL files and manifest. Only this offline utility uses standard-library SQLite. |
| `pnpm db:verify` / [verify-research-postgres.ts](migrations/verify-research-postgres.ts) | Builds via `db:verify:build`, then accepts `--data-root DIRECTORY`; read-only application-reader verification of every run/event/published report and matching artifacts in the selected PostgreSQL database. |
| `pnpm db:import` / [import-research-postgres.mjs](migrations/import-research-postgres.mjs) | `--archive DIRECTORY`; default imports/verifies then rolls back. `--commit --expected-sha256 HASH` commits the reviewed archive into an empty migrated research target. Never blindly merges active datasets. |
| [standalone-postgres-fixture.mjs](standalone-postgres-fixture.mjs) | Internal verifier helper; creates/drops only a UUID-named test DB through a loopback `_test` connection. |

All transfer tools support `--help`. Final production export requires drained/stopped writers, account-ownership reconciliation, retained recovery backups, and protected release deployment. A successful local rehearsal does not switch RDS.

## Runtime startup and packaging

| File | Caller and responsibility | Inputs and outputs |
| --- | --- | --- |
| [start-local.mjs](start-local.mjs) | Launcher for `start:local`, `start`, and `preview` | Starts web and packaged worker; manages child shutdown. Packaged serve mode also starts the briefing worker |
| [prepare-standalone.mjs](prepare-standalone.mjs) | `postbuild` packaging | Copies public/static files, workers, required dependencies, and migrations into `.next/standalone`; replaces generated subdirectories |
| [standalone-worker-entry.mjs](standalone-worker-entry.mjs) | Copied as `research-worker/worker.mjs` | Checks packaged PostgreSQL driver availability and invokes `leaseWorker.js`; run the packaged copy, not this source file |
| [standalone-briefing-worker-entry.mjs](standalone-briefing-worker-entry.mjs) | Copied as `briefing-worker/worker.mjs` | Passes CLI arguments to `briefingWorker.js`; depends on the packaged layout |

## CI and standalone verification

| File | Responsibility | Invocation or boundary |
| --- | --- | --- |
| [ci-lint-changed.sh](ci-lint-changed.sh) | Biome checks for changed files | `bash scripts/ci-lint-changed.sh <base-sha>`; skips when the base is invalid |
| [ci-production-change.sh](ci-production-change.sh) | Prints whether deployment is needed | `bash scripts/ci-production-change.sh <base-sha>`; compares against `GITHUB_SHA` or HEAD; invalid base returns true |
| [verify-standalone-worker.mjs](verify-standalone-worker.mjs) | Standalone verification CLI | `node scripts/verify-standalone-worker.mjs --probe` or `--full`; optional `--package-root <path>`; requires build output, a real PostgreSQL test connection, and the platform-specific protected runtime |
| [verify-standalone-worker-full.mjs](verify-standalone-worker-full.mjs) | Full verification implementation | Called by the CLI; temporary packages, databases, and processes |
| [verify-standalone-worker-failures.mjs](verify-standalone-worker-failures.mjs) | Failure-condition verification | Used by full verification; creates temporary permission and port failure conditions |
| [standalone-process.mjs](standalone-process.mjs) | Process, port, and HTTP wait utilities | Internal module, not a direct CLI |
| [standalone-worker-fixture.mjs](standalone-worker-fixture.mjs) | Seeds verification databases and artifacts | Internal fixture; not a production data generator |
| [standalone-official-handler-fixture.mjs](standalone-official-handler-fixture.mjs) | Exercises the packaged handler with a deterministic Codex substitute | Tests integration behavior, not real-model research quality |

The [pipeline](../.github/workflows/pipeline.yml) is authoritative for actual CI calls. Not every verifier runs in CI. The production-change classifier exempts specific paths; a Markdown extension alone does not prevent deployment. For example, a new `scripts/README.md` is outside its general `docs/**` exclusion.

## Research operations and auditing

| File | Responsibility | Inputs, outputs, and effects |
| --- | --- | --- |
| [research-codex-probe.mjs](research-codex-probe.mjs) | Temporarily compiles and runs the readiness command | `pnpm research:codex:probe`; temporary output under `.stocksembly-verification`; checks the actual execution environment |
| [research-sec-identity.mjs](research-sec-identity.mjs) | Compiles the SEC identity CLI | `configure` or `require`; delegates to `src/research/server/data/sec/secIdentityConfigCommand.ts` |
| [run-research-quality-live.ts](run-research-quality-live.ts) | Runs actual NVDA and TSLA research, publication, and translation checks | `pnpm research:quality:live`; external provider/model calls and local writes; requires the environment below |
| [audit-official-five-reports.ts](audit-official-five-reports.ts) | Audits stored committee, market, company, financial, and risk reports from a ledger | Arguments `<ledger.json> <output-dir>`; reads configured PostgreSQL and artifacts selected by `STOCKSEMBLY_DATA_DIR`; writes `official-content-audit.json` |
| [quality-timeseries.ts](quality-timeseries.ts) | Recalculates quality scores for stored report versions offline | Reads configured PostgreSQL and matching artifacts; optional `[outputDir]`, default `.stocksembly-verification/quality-archive`; writes dated JSON/Markdown, not production score updates |

### Run the TypeScript audit tools

These two audit tools do not have package aliases. On Node 20, bundle them with the project's Vite server configuration before executing:

```bash
pnpm exec vite build --config vite.worker.config.ts --ssr scripts/quality-timeseries.ts --outDir .stocksembly-verification/quality-timeseries-cli
STOCKSEMBLY_DATABASE_URL=postgresql://127.0.0.1:5432/stocksembly_audit STOCKSEMBLY_DATA_DIR=/absolute/path/to/artifact-copy node .stocksembly-verification/quality-timeseries-cli/quality-timeseries.js

pnpm exec vite build --config vite.worker.config.ts --ssr scripts/audit-official-five-reports.ts --outDir .stocksembly-verification/official-audit-cli
STOCKSEMBLY_DATABASE_URL=postgresql://127.0.0.1:5432/stocksembly_audit STOCKSEMBLY_DATA_DIR=/absolute/path/to/artifact-copy node .stocksembly-verification/official-audit-cli/audit-official-five-reports.js /absolute/path/to/ledger.json .stocksembly-verification/official-audit
```

Both bundle commands were checked with Node 20.20.2 during this documentation pass. That earlier documentation pass did not run database auditing. Select an isolated PostgreSQL database and matching artifacts; database records alone can leave artifact lookups unresolved. Example paths above are placeholders, not bundled datasets.

### Live quality environment

The live runner's `EnvSchema` requires all of the following. Match the local web and worker environment before running it.

| Variable | Required value or purpose |
| --- | --- |
| `RUN_LIVE_RESEARCH` | `1` |
| `STOCKSEMBLY_DATA_DIR` | Dedicated path starting with `/tmp/stocksembly-quality.` |
| `STOCKSEMBLY_PUBLIC_ORIGIN` | `http://127.0.0.1:3000` |
| `RESEARCH_AUTOMATION_TOKEN_PATH` | Automation authentication token file |
| `QUALITY_RUN_LEDGER` | Output ledger path |
| `RESEARCH_QUALITY_EVIDENCE_DIR` | Output evidence directory |

## Asset processing

See the [source-asset guide](../assets/research/README.md) for provenance and current consumers. Each processor writes or overwrites public images. Normal web builds do not run these processors.

| File | Invocation | Source to output and availability |
| --- | --- | --- |
| [prepare-office-v7-assets.mjs](prepare-office-v7-assets.mjs) | `node scripts/prepare-office-v7-assets.mjs`; optional `--actors-only` | v7 originals to background, actors, portraits, and furniture still referenced by the application |
| [prepare-office-v8-pilot-assets.mjs](prepare-office-v8-pilot-assets.mjs) | `node scripts/prepare-office-v8-pilot-assets.mjs` | v8 pilot originals to v8 actors/entities; source directory absent from Git; does not reproduce the entire v8 background |
| [prepare-office-v9-assets.mjs](prepare-office-v9-assets.mjs) | `node scripts/prepare-office-v9-assets.mjs [agentId ...]` | v9 actor originals and v8 pilot entity originals to v9 output; both input directories absent from Git |

## Visual tools and historical scenarios

Browser tools interact with pages; some can start research. Their current selector compatibility was not established by this documentation review.

| File | Entry point and purpose | Inputs and outputs |
| --- | --- | --- |
| [lighthouse-audit.mjs](lighthouse-audit.mjs) | `pnpm audit:lighthouse` | Chrome required; `AUDIT_URL` defaults to `http://127.0.0.1:4175/`; writes `.omo/evidence/stocksembly-home/lighthouse` |
| [reference-diff.mjs](reference-diff.mjs) | `pnpm audit:visual-diff` | Compares `docs/lovable-scale-reference.png` with `.omo/evidence/stocksembly-home/home-reference-size.png`; requires the capture first and writes JSON beside it |
| [capture-visual.mjs](capture-visual.mjs) | `node scripts/capture-visual.mjs` | `CAPTURE_URL` defaults to port 4175; writes `.omo/evidence/stocksembly-home`; includes a Start research click |
| [capture-research-completion.mjs](capture-research-completion.mjs) | `node scripts/capture-research-completion.mjs` | Accepts `CAPTURE_URL`, `CAPTURE_VIEWPORT`, `CAPTURE_STATE`, `CAPTURE_MODE`, `CAPTURE_LOCALE`, `CAPTURE_EVIDENCE_DIR`; default evidence `.omo/evidence/research-completion`; historical completion presentation checks |

## Script tests

| File | Coverage and runner |
| --- | --- |
| [ci-lint-changed.test.sh](ci-lint-changed.test.sh) | Changed-file lint shell compatibility; `bash scripts/ci-lint-changed.test.sh` |
| [ci-production-change.test.sh](ci-production-change.test.sh) | Deployment classification; `bash scripts/ci-production-change.test.sh` |
| [standalone-worker-entry.test.ts](standalone-worker-entry.test.ts) | Research worker entrypoint; Vitest |
| [standalone-worker-launchers.test.ts](standalone-worker-launchers.test.ts) | Packaged worker launchers; Vitest |
| [verify-standalone-worker.test.ts](verify-standalone-worker.test.ts) | Probe verification CLI; Vitest |
| [verify-standalone-worker.full.test.ts](verify-standalone-worker.full.test.ts) | Full verification CLI; Vitest |

Select a Vitest file with `pnpm exec vitest run scripts/<filename>`. The existence of a test does not mean its target tool is part of production execution.

## Adding or retiring a script

Document the caller, working directory, required inputs, output location, and any database or remote writes. Add an alias only when it provides a useful supported entrypoint. Before moving a script, inspect package commands, workflow calls, imports, tests, and documentation links. Preserve historical prerequisites explicitly instead of presenting an old tool as fresh-clone setup.

## Retired tools

The v6 asset processor, fixed-port final-F3 capture, and plan/scope verifiers with missing historical baselines were archived and removed with their dedicated tests. They are not current CI commands. See [restoration instructions](../docs/repository-cleanup.md). Current quality fixtures, contract tests, CI helpers and packaged-worker checks remain supported.

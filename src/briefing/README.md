# Briefing Subsystem

[Repository guide](../../README.md)

Briefing generation has its own domain, server implementation and worker. It shares the repository and deployment package with research but is not automatically started by every research development command.

## Structure

| Directory | Purpose |
| --- | --- |
| `domain/` | Briefing contracts, earnings/calendar rules and limitations |
| `server/` | Server-side briefing generation and integration |
| `worker/` | Worker process and local preview generation |
| `quality/` | Briefing quality evaluation support |

## Entry points

- `worker/briefingWorker.ts` is bundled by `pnpm briefing:worker:build`.
- `worker/localBriefingPreview.ts` backs `pnpm briefing:preview:generate`.
- The packaged CLI is `.next/standalone/briefing-worker/worker.mjs`.
- Routes under `app/briefing-room` and components under `src/components/briefing` present the result.

## Execution and checks

`pnpm briefing:worker:typecheck` checks this worker's TypeScript scope. `pnpm briefing:worker:build` bundles it. `pnpm briefing:worker:health` and `pnpm briefing:run` use the packaged CLI, so a complete package must exist first.

`pnpm start:local` starts web and research-worker processes, not this worker. Do not assume a working research room proves that briefings are being generated. Preview generation may fetch data and write local output; it is not a documentation check.

## Maintenance boundaries

Keep market-calendar behavior in the domain modules, process lifecycle in the worker, and rendering in the UI. Update colocated tests when changing contracts or calendar rules. Runtime data and generated bundles belong in configured output directories, not beside these source files.

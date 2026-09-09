# Research Pipeline and Presentation

[Repository guide](../../README.md)

This is the main research subsystem. It includes both the durable research engine and its public presentation. Office animation, model execution, publication and report rendering are related but separate concerns.

## Subdirectories

| Directory | Role | Typical reason to edit |
| --- | --- | --- |
| `domain/` | Schemas, IDs, role registry, report contracts, quality and publication policies | Change an invariant or stored/public data shape |
| `ports/` | Interfaces used at integration boundaries; contract-test support | Introduce or replace an adapter |
| `application/` | Use cases such as output commitment, assembly and publication recovery | Change application-level transitions or recovery |
| `workflow/` | Specialist work, challenge/response, audit and chair synthesis stages | Change a research stage or stage-owned validation |
| `compositions/` | Official/fixture wiring and coordinator composition | Connect adapters or adjust coordination |
| `worker/` | Lease-based execution, retries, readiness and process runtime | Diagnose jobs that stall or fail outside the browser |
| `server/` | API implementation, providers, persistence, artifacts and model runner | Diagnose HTTP, external data or durable storage behavior |
| `client/` | Browser API client, schemas, event source and run projection | Fix resume, cancellation, reconnect or live state display |
| `technical/` | Technical-chart analysis and related data processing | Change candle-derived analysis behavior |
| `pdf/` | Report/PDF rendering and chart SVG output | Change exported report layout |
| `quality/` | Quality execution and score helpers | Change offline or live evaluation tooling |
| `officeMotion/` | Office motion implementation | Change actor movement behavior |
| `testFixtures/` | Deterministic test inputs and quality samples | Extend reproducible test cases |

## Important entry points

- `worker/leaseWorker.ts`: research worker process entry bundled by the build.
- `compositions/officialWorkflowCoordinator.ts`: official workflow coordination.
- `server/api/liveResearchApi.ts`: live server API wiring.
- `client/useResearchRun.ts`: browser-side run projection and commands.
- `domain/roleRegistry.ts`: research role definitions; unrelated to `.agents/skills`.
- `researchReportToFile.ts` and `researchFileEditorialModel.ts`: report-to-reader presentation transformations.
- `officeSceneManifest.ts`: scene geometry and runtime asset paths.
- Root `office*` modules: rendering, runtime state and presentation coordination.

## Server map

| Area | Responsibility |
| --- | --- |
| `server/data/` | Provider adapters including SEC and InsightSentry |
| `server/codex/` | Model runner input, reservation, isolation and execution evidence |
| `server/persistence/` | Durable records and SQLite implementation/migrations |
| `server/artifacts/` | Artifact bytes and storage adapters |
| `server/api/`, `server/http/` | API use cases and HTTP concerns |
| `server/queue/` | Queue integration |
| `server/researchRoom/` | Report catalog, access and localization support |
| `server/qa/` | Report-question functionality |

## Trace a failure

1. Identify the run and the failed job/stage in durable records.
2. Separate collection failures, runner input failures, model output failures, commit failures and publication failures.
3. Follow the stage handler into its owning adapter or policy.
4. Confirm whether the stored result or only its browser projection is wrong.
5. Test recovery using the same stage/snapshot contract where supported.

A generic failure card is not enough to identify the cause. Increasing UI timeouts will not fix provider schema errors, and an animation replay must not trigger duplicate research.

## Inputs, outputs and assets

Inputs include a research request, sealed evidence and stage-owned artifacts. Outputs include durable run events, accepted artifacts, reports and public projections. Storage locations come from server configuration, not this source directory.

Current scene configuration mixes v8 backgrounds, v7 characters and v9 resources. Consult the [asset provenance guide](../../assets/research/README.md) before removing an older asset version.

## Relevant checks

Use the nearest colocated tests first. `pnpm research:quality` runs deterministic quality fixtures; `pnpm research:quality:contracts` selects broader research contracts used in CI. `pnpm research:worker:typecheck` and `pnpm research:worker:build` cover the worker. Live evaluation has separate environment and model-call requirements documented in the [script guide](../../scripts/README.md).

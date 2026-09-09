# Source Code Map

[Repository guide](../README.md)

This directory contains application implementation shared by routes, workers and tests. Choose a domain before editing; similarly named client, server and presentation modules have different responsibilities.

## Module ownership

| Directory | Responsibility | Starting point |
| --- | --- | --- |
| `components/` | React UI, report rendering and interaction | [Component guide](components/README.md) |
| `research/` | Research contracts, workflows, persistence, worker execution, report models and office presentation | [Research guide](research/README.md) |
| `briefing/` | Briefing generation, domain rules and background execution | [Briefing guide](briefing/README.md) |
| `accounts/` | Onboarding and account-store abstraction with PostgreSQL implementation | `accounts/onboarding.ts`, `accounts/server/accountStore.ts` |
| `auth/` | Amplify client setup, auth errors and locale preferences | `auth/amplifyClient.ts`, `auth/researchClient.ts` |
| `admin/` | Analytics contracts, metric definitions, attribution and authorized server access | `admin/analyticsContracts.ts`, `admin/server/adminAuthorization.ts` |
| `editorial/` | Multilingual editorial content, catalog, metadata and access helpers | `editorial/catalog.ts`, `editorial/content/index.ts` |
| `lib/` | Shared utilities, localization, stock metadata, legal and integration helpers | Locate the owning module rather than adding unrelated helpers to a large common file |
| `styles/` | Global, page and feature CSS | Check component-adjacent styles as well |
| `test/` | Shared test setup | `test/setup.ts`, referenced by Vitest |
| `App.tsx` | Main application composition | Follow imports from the root route |

## Dependency boundaries

Routes under `app/` call into this directory. React components consume presentation models and client APIs. Server modules own secrets, database access and external adapters. Research and briefing workers run outside the page lifecycle. Keep these boundaries visible when moving code.

Domain contracts often use Zod and are consumed by more than one process. A contract change may require updates to persistence, worker input/output, HTTP projection and presentation, even if a single UI field motivated it.

## Tests and generated data

Tests and test support are commonly colocated with implementation. `src/test/` is only the shared setup, not the entire test suite. Deterministic research fixtures belong in the existing fixture areas; runtime SQLite files and generated worker bundles do not belong in `src/`.

## Choosing a check

Use targeted Vitest files for the changed module and the appropriate TypeScript project. Worker changes also need the relevant worker build. Use browser inspection for layout and interaction changes. Avoid running live research for documentation-only edits.

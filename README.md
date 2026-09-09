# Stocksembly Repository Guide

Stocksembly combines a stock-research website, independent research agents, committee synthesis, report publication, and background workers in one repository. Start here to locate implementation code; use the folder READMEs for boundaries and maintenance guidance.

**Inventory baseline:** GitHub [`main` at 3aebe39](https://github.com/wrd1stProgrammer/Stocksembly/tree/3aebe39e0d435f05d4427253163abc5121666872), reviewed September 9, 2026. Maintainer for this documentation pass: Minsik Chae. Untracked files in a developer's checkout are not part of this baseline.

## Start with the task

| Task | Read first | Implementation area |
| --- | --- | --- |
| Understand the product | [Product scope](PRODUCT.md) | [Application routes](app/README.md), [source map](src/README.md) |
| Change a research report | [Component guide](src/components/README.md) | `src/components/research/file/`, adjacent report CSS |
| Change research execution or publication | [Research guide](src/research/README.md) | `src/research/workflow/`, `application/`, `worker/`, `server/` |
| Change office characters or movement | [Research guide](src/research/README.md), [asset guide](assets/research/README.md) | `src/research/office*`, `public/research/` |
| Run or diagnose a service | [Script entry points](scripts/README.md) | `package.json`, packaged worker entry points |
| Change deployment | [Infrastructure guide](infra/README.md) | `infra/aws/`, `.github/workflows/`, `Dockerfile` |
| Investigate a test | [Test guide](tests/README.md) | E2E under `tests/e2e/`; colocated unit/integration tests elsewhere |
| Decide whether an old file can be removed | [Cleanup decisions](docs/repository-cleanup.md) | Check consumers, generators, and source availability first |

## Root directories

Each guide explains the directory's contents, important entry points, dependencies, outputs, and change boundaries.

| Directory | Responsibility | Guide |
| --- | --- | --- |
| `app/` | Next.js routes, layouts, HTTP handlers, development previews | [Routes and request boundaries](app/README.md) |
| `src/` | UI, domain rules, adapters, workers, account and editorial features | [Source architecture](src/README.md) |
| `public/` | Files served at public URLs: branding, editorial artwork, office runtime assets | [Public asset contract](public/README.md) |
| `assets/` | Source artwork used to generate public office assets | [Source assets](assets/README.md) |
| `scripts/` | Local launchers, packaging, CI helpers, diagnostics, asset processors | [Complete script inventory](scripts/README.md) |
| `tests/` | Browser/E2E scenarios outside the colocated test suites | [Test selection and environments](tests/README.md) |
| `infra/` | AWS provisioning, deployment, service definitions and environment examples | [Infrastructure map](infra/README.md) |
| `docs/` | System guides, architecture, plans, evaluation records and QA captures | [Documentation index](docs/README.md) |
| `design/` | Visual exploration and office layout concepts | [Design references](design/README.md) |
| `.github/` | CI/deployment workflows and collaboration templates | [Automation boundaries](.github/README.md) |
| `.agents/` | Instructions for developer-facing coding tools | [Development skills](.agents/README.md) |
| `.artifacts/` | Selected historical quality-gate evidence committed to Git | [Evidence archive](.artifacts/README.md) |

## Root files

| File | Purpose and maintenance rule |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | Product requirements and scope. Interpret together with the implementation, not as proof that every feature is shipped. |
| [DESIGN.md](DESIGN.md) | Design and office presentation contracts. Read when changing layout, animation or character behavior. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Collaboration and release conventions. Confirm the intended PR base before publishing a branch. |
| [design-qa.md](design-qa.md) | Historical design review notes; not a current automated test result. |
| [package.json](package.json) | Commands, dependencies and Node requirement: `>=20.20.0 <21`. |
| [pnpm-lock.yaml](pnpm-lock.yaml), [pnpm-workspace.yaml](pnpm-workspace.yaml) | Installation resolution and pnpm settings. CI currently selects pnpm 10.34.1. |
| [.env.example](.env.example) | Environment variable examples. Real credentials belong outside Git. |
| [.gitignore](.gitignore), [.dockerignore](.dockerignore) | Git exclusions and Docker context exclusions respectively; these are not interchangeable. |
| [Dockerfile](Dockerfile) | Dependency installation, build, and standalone runtime image. |
| [next.config.ts](next.config.ts), [next.config.test.ts](next.config.test.ts) | Next configuration and its regression tests. |
| [proxy.ts](proxy.ts), [proxy.test.ts](proxy.test.ts) | Request-boundary behavior and tests. |
| [next-env.d.ts](next-env.d.ts) | Next-managed TypeScript declarations. Avoid unrelated generated diffs. |
| [tsconfig.json](tsconfig.json) | Main TypeScript project. |
| [tsconfig.worker.json](tsconfig.worker.json), [tsconfig.briefing-worker.json](tsconfig.briefing-worker.json) | Worker-specific typecheck scopes. |
| [vite.worker.config.ts](vite.worker.config.ts) | Server/worker diagnostic bundling. |
| [vitest.config.ts](vitest.config.ts), [playwright.config.ts](playwright.config.ts) | Unit/integration and browser-test configuration. |
| [biome.json](biome.json) | Formatting and lint configuration. |
| [postcss.config.mjs](postcss.config.mjs), [components.json](components.json) | CSS processing and UI tooling configuration. |

## Execution and asset flows

```text
app/ + src/ + public/
  → pnpm build
  → research worker bundle + briefing worker bundle + Next build
  → postbuild: scripts/prepare-standalone.mjs
  → .next/standalone/
  → web process and separately launched workers

assets/research/*-sources/
  → manual scripts/prepare-office-*.mjs invocation
  → public/research/office-v*/
  → URLs consumed by components, CSS and scene manifests
```

`pnpm dev` starts the Next development server, not the research worker. After a build, `pnpm start:local` starts the web and research-worker processes. It does not automatically start the briefing worker.

**Important:** when both production-sync SSH variables are present, `start:local` also starts production synchronization. That tool merges local published research into the remote production store. Read [scripts/README.md](scripts/README.md) before using a production-connected environment for local QA.

## Generated and local-only directories

| Path | Typical contents | Treatment |
| --- | --- | --- |
| `.next/` | Next output and assembled standalone package | Generated; do not edit as source |
| `node_modules/` | Installed dependencies | Generated from package and lock files |
| `.stocksembly-verification/` | Worker bundles, diagnostic builds and local evidence | Git-ignored scratch output |
| `research-data/` | Local research data when configured there | Persistent data, not disposable source |
| `test-results/`, `playwright-report/` | Browser test traces and reports | Generated diagnostics |
| `.omo/` | Paths used by some historical tools | Git-ignored; a path name does not require running OMO |

Presentations, source images and other untracked local files must not be removed based solely on this inventory. The [cleanup register](docs/repository-cleanup.md) records what was actually checked.

## Keeping these guides useful

When adding a root directory, update this index and add its README. When adding or changing a script, update its purpose, arguments, outputs and side effects in the script index. Update a folder guide when an entry point or dependency changes. Keep historical plans intact and label their scope rather than silently treating them as current runtime documentation.

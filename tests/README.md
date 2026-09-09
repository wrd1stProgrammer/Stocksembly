# Browser tests and test navigation

[Repository guide](../README.md) · [Scripts guide](../scripts/README.md)

This directory holds Playwright browser scenarios. Most unit and contract tests are colocated with their implementation in `src`, `app`, and `scripts`; `tests` is not the complete test suite.

## Test runners

| Runner | Configuration | Scope |
| --- | --- | --- |
| Vitest | [vitest.config.ts](../vitest.config.ts) | Colocated unit and contract tests; excludes `tests/e2e` |
| Playwright | [playwright.config.ts](../playwright.config.ts) | Browser scenarios in [e2e](e2e/) |

Vitest uses jsdom and [src/test/setup.ts](../src/test/setup.ts). Select a relevant file with `pnpm exec vitest run <path>` rather than treating a browser scenario as a unit test.

## Browser inventory

| File | Scenario area |
| --- | --- |
| [home.spec.ts](e2e/home.spec.ts) | Home-page behavior |
| [office-responsive.spec.ts](e2e/office-responsive.spec.ts) | Office layout across viewport sizes |
| [office-v7.spec.ts](e2e/office-v7.spec.ts) | Version-specific office behavior |
| [office-visual.spec.ts](e2e/office-visual.spec.ts) | Office visual checks |
| [research-composition-fixture.spec.ts](e2e/research-composition-fixture.spec.ts) | Deterministic research composition |
| [research-official-five-report.spec.ts](e2e/research-official-five-report.spec.ts) | Official report flow across report types |
| [research-quality-live.spec.ts](e2e/research-quality-live.spec.ts) | Live research quality scenarios |
| [research-redesign-visual.spec.ts](e2e/research-redesign-visual.spec.ts) | Research presentation checks |
| [research-room-published-responsive.spec.ts](e2e/research-room-published-responsive.spec.ts) | Published research and responsive room layout |
| [smoke-auth-pages.spec.ts](e2e/smoke-auth-pages.spec.ts) | Authentication-page smoke coverage |
| [smoke-landing.spec.ts](e2e/smoke-landing.spec.ts) | Landing-page smoke coverage |
| [smoke-research-flow.spec.ts](e2e/smoke-research-flow.spec.ts) | Research-flow smoke coverage |

Read the selected scenario's environment guards and fixtures before running it. A file's name alone does not establish whether it calls a real model, publishes data, or uses a deterministic fixture.

## Server and project selection

The default base URL is `http://127.0.0.1:4174`; `PLAYWRIGHT_BASE_URL` overrides it. The default server command builds the application and starts it on port 4174 with `OFFICE_CALIBRATION=1`. Set `PLAYWRIGHT_SERVER_COMMAND` when a different startup command is required. An existing server is reused only when `PLAYWRIGHT_REUSE_SERVER=1`.

`RESEARCH_MODE=official` selects official mode; otherwise the configuration uses fixture mode. The `fixture` project limits discovery to composition, home, and smoke scenarios. The `chrome` project provides broader fixture coverage. Official mode exposes the `official` project and a WebKit project restricted to the five-report scenario. Check the config before choosing a project and file combination.

```bash
pnpm exec playwright test tests/e2e/home.spec.ts --project=fixture
```

This example uses the configured server lifecycle. It is not a production smoke command. Local startup can launch production synchronization if its SSH variables are configured; use an isolated environment as explained in the scripts guide.

## Evidence and maintenance

Playwright retains traces on failure and enables parallel execution. Keep test state isolated; do not point parallel tests at a shared production data directory. A fixture pass demonstrates UI or contract behavior under its supplied data, not the quality of a new live report.

Update a scenario when its intended user behavior changes. Preserve meaningful assertions and identify obsolete selectors explicitly. Use focused checks for a small change; documentation-only navigation updates generally need link and inventory checks rather than new research runs.

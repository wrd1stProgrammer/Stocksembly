# Application Routes and HTTP Boundaries

[Repository guide](../README.md)

This directory is the Next.js App Router boundary. It maps URLs to pages and HTTP handlers, loads request-specific state, and composes implementation from `src/`. It is not the home of long-running research orchestration.

## Directory map

| Area | Purpose | Follow the implementation into |
| --- | --- | --- |
| `page.tsx`, `layout.tsx`, `loading.tsx`, `not-found.tsx` | Root page composition, shared layout, loading and missing-page UI | `src/App.tsx`, shared components and styles |
| `api/` | Research, account, billing/webhook, admin and other HTTP endpoints | Corresponding server modules under `src/` |
| `research/[symbol]/` | Symbol-specific research experience | `src/components/research/` and `src/research/client/` |
| `research-room/` | Report browsing and report detail routes | Report catalog and presentation modules |
| `briefing-room/` | Briefing browsing | `src/briefing/` and briefing components |
| `login/`, `signup/`, `confirm/`, `forgot-password/`, `auth/` | Authentication pages and callback | `src/auth/`, authentication components |
| `admin/` | Administrative pages | `src/admin/server/` authorization and queries |
| `[locale]/`, `en/`, `ko/` | Localized editorial and stock landing routes | Editorial catalog, metadata and stock data helpers |
| `pricing/`, legal and public-information routes | Pricing, policies, contact and explanatory content | Billing, legal and public-information components |
| `dev/`, `research-fixture/`, `briefing-preview/`, `showcase/` | Developer previews and visual inspection surfaces | Fixture and preview implementations; inspect each route's environment guard |
| `_lib/` | Shared server-side page request helpers | Request-local loading and access logic |
| `fonts/` | Bundled font input used by the app | Root layout/font configuration |
| `sitemap.ts`, `llms.txt/` | Discovery metadata and text endpoints | SEO and agent-readable content helpers |

## Change workflow

Start at the route matching the URL, then follow its imported component or server module. Keep domain decisions in those modules so browser routes, workers and tests do not develop separate rules. Keep server-only authentication, storage and process access out of client components.

For research changes, distinguish requesting a run, displaying its durable state, and executing the run. A page navigation or animation completion must not become the source of truth for publication.

## Checks

Route tests are colocated as `*.test.ts` or `*.test.tsx`. Browser flows live under `tests/e2e/`. Use `pnpm typecheck` plus the relevant route test after behavioral changes. For layout-only work, inspect the route at the affected viewport and theme. Development previews are not proof of an authenticated production flow.

## Outputs and boundaries

Routes render HTML or return HTTP responses. Durable research and account records belong in the configured stores, not inside this directory. Do not save generated screenshots or run data alongside route files.

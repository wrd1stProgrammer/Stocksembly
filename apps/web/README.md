# Web application

Independent deployment boundary for the web runtime. Build from the repository root with `pnpm build:web` or `docker build -f apps/web/Dockerfile .`.

Shared domain, contracts and PostgreSQL adapters remain under `src/`. Keeping one canonical copy avoids divergent report formats. The web application routes remain in root `app/`; this directory owns its independent build and container definition rather than duplicating route sources.

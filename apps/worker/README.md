# Research worker application

This application owns research and briefing execution. Build from the repository root with `pnpm build:worker` or `docker build -f apps/worker/Dockerfile .`.

The worker image contains its bundled entry points, PostgreSQL migrations and runtime dependencies. It does not include Next.js, web routes or public images. Shared research domain and persistence code remains under `src/` so report formats and ownership rules have one implementation.

Production work is dispatched through SQS and leased in PostgreSQL. Shared artifacts are durable in private S3; the local disk is only a cache and working directory. The deployment script drains active attempts before replacing the worker.

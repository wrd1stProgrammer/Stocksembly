# Stocksembly AWS sandbox

This stack is the low-cost production foundation for the five-month AWS
Innovation Sandbox. It is region-neutral and creates one application host, a private PostgreSQL
database, an artifact bucket, a research queue with a dead-letter queue, and a
Cognito user pool.

The production Cognito pool also uses a manually managed Google identity
provider named `Google`. Its OAuth credential is held by Google Cloud and
Cognito, while the app client configuration in this template preserves both
`COGNITO` and `Google` as supported sign-in providers.

## Cost controls

- One `t3.large` EC2 instance
- One Single-AZ `db.t4g.micro` PostgreSQL instance
- No NAT gateway or load balancer
- One attached Elastic IP
- S3 multipart uploads are aborted after seven days
- RDS storage autoscaling is capped at 100 GB

## Local development

Local development continues to use `.env.local` and the local SQLite research
store. Production settings live only on the instance in
`/etc/stocksembly/aws.env`. If production database inspection is required,
connect through an SSH tunnel instead of exposing PostgreSQL publicly.
The managed RDS secret supplies the generated username and password, while
CloudFormation injects the private database host, port, and database name as
separate runtime variables. The production image also carries AWS's official
RDS global CA bundle and verifies the database certificate chain.

The account store is optional in local development. With no database
variables, login and research keep working against the local SQLite principal.
S3 and SQS are optional in the same way: without
`STOCKSEMBLY_ARTIFACT_BUCKET` and `STOCKSEMBLY_RESEARCH_QUEUE_URL`, the local
filesystem CAS and interval-based worker scheduler remain active.
Research admits up to ten runs when API is enabled, or four with API disabled.
All research stages use Luna. Runs beyond the effective capacity wait in a durable
queue (up to 50 queued requests); the research room shows the queue position and
automatically dismisses the modal when the run starts. Queued requests refresh
every five seconds while visible. `STOCKSEMBLY_ACTIVE_RUNS` is no longer used.

`STOCKSEMBLY_GLOBAL_CODEX_PROCESSES` defaults to 12 concurrent worker jobs, including
jobs waiting for a model slot. Each run can hold at most ten job slots. The worker
refills freed jobs continuously and prioritizes the least-served runs.
Each actual model task now chooses authentication independently. A process-wide
pool shared by research and auxiliary calls prefers Pro, with ten Pro task slots
(`STOCKSEMBLY_CODEX_PRO_CONCURRENCY=10`) and six API task slots
(`STOCKSEMBLY_CODEX_API_CONCURRENCY=6`). A task waiting 30 seconds for Pro can use API
(`STOCKSEMBLY_CODEX_API_SPILL_AFTER_MS=30000`). The worker-job cap still applies;
these pool maxima are not a promise of 16 simultaneous model calls. Slots are shared
across runs, not reserved per run. The persisted run backend remains an admission
bucket only; actual billing authentication is recorded as `executionBackend` in
each launch manifest and lifecycle evidence. Explicit retries use queue admission.

The main research workflow reserves at most65 launch ordinals per run: one collection,
25 mandatory agent calls, three optional follow-ups, 12 targeted rewrites and
24 transient retry slots. Auxiliary news screening and research planning calls are
recorded separately;65 is not a cap on every CLI call made by the account. Transient failures do not consume the per-artifact
three-rewrite allowance; rewrites already spent do not reset across transient
attempts. Ordinals are never refunded or reused. Worker shutdown preserves active
jobs for retry, while explicit user cancellation remains terminal. Unsupported
percentage sentences and missing analytical angles may be omitted with a disclosed
limitation when grounded analysis survives. Exhausted research is not requeued
into another immediate budget failure; publication-only recovery remains available.
Worker ownership uses a dedicated `worker-lease.sqlite` transaction held for the
process lifetime; SIGKILL releases the kernel lock even when a new container reuses
PID1. Never delete this lease database while a worker is alive. When first upgrading
from the legacy PID-file version, stop the old worker before starting the new one;
mixed legacy/new workers must not share the data directory concurrently.
Initial collection retries use per-job failure counts, with at most eight attempts,
exponential backoff and the provider retry time when later. Market-data429 cooldown
is shared across waiting requests and restored from persisted retry intents.

Leave `STOCKSEMBLY_CODEX_API_ENABLED=0` for subscription-only operation (four active
runs, then queue). To enable the additional six, configure both web and worker with
`STOCKSEMBLY_CODEX_API_ENABLED=1` and an absolute
`STOCKSEMBLY_CODEX_API_AUTH_PATH`. Use a separate API-only Codex `auth.json`, owned by
the worker user with mode 0600, for example
`/home/ec2-user/.codex/api/auth.json` within the existing Docker bind mount. It must
contain a nonempty `OPENAI_API_KEY` and no ChatGPT `tokens`. Provision it using the
official CLI API-key login flow with a separate configuration directory; never
replace `/home/ec2-user/.codex/auth.json`, the existing Pro login. Key contents are
copied into each attempt's isolated home and are never passed in process arguments.
No API probe runs while disabled. With API enabled, API readiness runs when API is
first used, including worker startup if Pro authentication has failed. Pro login
failures open a shared worker circuit: queued and new tasks use API immediately,
while healthy in-flight Pro tasks finish. A pre-launch login failure can switch
before the task launches. An authentication failure after an attempted launch
returns an immediate transient outcome so the durable worker allocates a fresh
attempt and ordinal on API; it never repeats a launch in the same directory.
The existing total launch budget still applies. Invalid API credentials remain an
error and do not trigger an unlimited retry or bounce back to the failed Pro login.
Non-authentication failures preserve their existing recovery policy.

Replacing the Pro login file changes its readiness fingerprint and allows Pro
again. Restarting the worker reruns admission and falls back to API again if the
login is still invalid. This state and task pool are process-local; the existing
exclusive worker lease prevents multiple research workers sharing the data store.
Settings must match between web and worker so queue capacity matches admission.
This change was tested with simulated process outputs; no paid API request was
made and the stored key/model access has not been live-validated.

To exercise the PostgreSQL account layer through a private tunnel, forward a
local port to the RDS endpoint through the application host and set:

```dotenv
STOCKSEMBLY_DATABASE_URL=postgresql://stocksembly_admin:<password>@127.0.0.1:5433/stocksembly
STOCKSEMBLY_DATABASE_SSL=false
```

Never commit the managed RDS password. Retrieve it from the database secret
only for the lifetime of the local inspection session.

The browser auth bundle expects these public build-time values:

```dotenv
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_aBlbfohE8
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=5njm1pei6ltopdks0g4a1m5cab
NEXT_PUBLIC_COGNITO_DOMAIN=stocksembly-prod-359463332817.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

Production CI injects the same Cognito identifiers with
`NEXT_PUBLIC_APP_ORIGIN=https://stocksembly.com` during the Docker build.

## Production persistence boundaries

- SQS is the external research admission queue. The API sends an idempotent
  run reference and the worker uses long polling instead of continuously
  polling while idle.
- SQLite remains the transactional coordinator for the many jobs inside one
  research run. A missed or duplicated SQS delivery is safe because the run
  record and job state remain authoritative and recoverable.
- Every content-addressed evidence and report artifact is written locally and
  mirrored to the private, versioned S3 bucket with a SHA-256 checksum. Missing
  local report blobs can be read from S3, and worker artifacts can be restored
  into the local CAS from S3.
- PostgreSQL holds Cognito users, entitlements, usage, run ownership, report
  ownership, and the latest user-visible run status. It intentionally does not
  duplicate the internal workflow tables yet.

## Deployment

The CloudFormation stack name is `stocksembly-prod`. The administrator
SSH CIDR is intentionally a single IPv4 address and should be updated when the
development network changes.

The application is not placed behind an ALB in this low-cost phase. Nginx
proxies port 80 to the Next.js service on `127.0.0.1:3000`. Add a domain and
TLS certificate before accepting public user credentials.

Deploy the current checkout after the stack finishes:

```bash
./infra/aws/deploy.sh <ApplicationPublicIp>
```

For a domain-backed production deployment, preserve the HTTPS public origin:

```bash
STOCKSEMBLY_PUBLIC_ORIGIN_OVERRIDE=https://stocksembly.com \
  ./infra/aws/deploy.sh <ApplicationPublicIp>
```

The deploy script never uploads `.env.local`. Put production-only provider
credentials in `/etc/stocksembly/app.env` on the instance. The web service is
enabled immediately; the worker is installed but deliberately left disabled
until Codex CLI login and the Linux worker runtime check are complete.

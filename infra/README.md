# Infrastructure and Deployment Entry Points

[Repository guide](../README.md)

The tracked infrastructure lives in `aws/`. This guide maps the files; the detailed operational runbook remains [aws/README.md](aws/README.md).

## File map

| File under `aws/` | Purpose |
| --- | --- |
| `stocksembly-sandbox.yaml` | Application infrastructure template: compute, database, artifacts, queue and identity resources |
| `stocksembly-cicd.yaml` | CI/CD infrastructure configuration |
| `deploy.sh` | Infrastructure deployment helper |
| `container-deploy.sh` | Application container deployment on the host |
| `provision-test-account.ssm.sh` | Host-side test-account provisioning procedure |
| `stocksembly-web.service` | Web service definition |
| `stocksembly-worker.service` | Research-worker service definition |
| `app.env.example` | Runtime environment example, without real credentials |

## Integration with the repository

`.github/workflows/pipeline.yml` builds the image and drives conditional production deployment. `Dockerfile` packages the app. `scripts/prepare-standalone.mjs` prepares the files consumed by the runtime image. These layers must agree on worker entry paths, native dependencies and environment variables.

## State and access boundaries

The AWS runbook distinguishes account storage in PostgreSQL from research persistence and artifact/queue adapters. Local configuration can use filesystem/SQLite paths when optional cloud integrations are absent. Do not infer production configuration from a local `.env.local` file.

Provisioning and deployment commands can change remote resources and services. Read the runbook, identify the target account/environment, and inspect the intended diff before executing. Documentation maintenance does not require provisioning, credential changes or deployment.

## Review focus

For infrastructure changes, review resource scope, environment propagation, persistence paths and rollback implications. Check shell syntax and the relevant template/workflow rather than starting a live research run as a substitute. Keep generated `*.outputs` files and secrets out of Git.

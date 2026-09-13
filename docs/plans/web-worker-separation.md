# Web and worker separation

## Scope

Separate the web and research worker inside the existing repository and deploy them to independent EC2 instances. Start with t3.medium for web and t3.large for worker. Keep RDS PostgreSQL as shared metadata storage and use private S3 for shared artifacts. ALB, multiple web replicas, Lambda, and autoscaling are deferred.

## Implementation sequence

1. Inspect current production release, application entry points, storage and authentication dependencies. Preserve unrelated working trees and existing services.
2. Define independent web and worker build/deploy entry points under apps, retaining shared domain and persistence code. Avoid moving source mechanically before dependencies are understood.
3. Make artifact publication durable in S3 before exposing completed records. Reconcile existing local objects against RDS digests; verify reads from a fresh host with no local cache. Inventory other filesystem dependencies.
4. Create role-specific infrastructure and restricted security groups/IAM. Create and save the requested PEM key privately outside the repository. Reuse existing RDS and CDN.
5. Prepare a separate worker and web deployment, with per-role health checks and rollback. Drain the existing worker before transfer; preserve stable public access while switching web.
6. Run actual research through request, progress, publication and report reading. Verify that navigating away does not interrupt work.
7. Run staged web load at 25, 50, 100 and 200 simulated readers, stopping on elevated errors or resource pressure. Keep model calls outside load tests. Record workload, duration, p95 latency, errors and resource limits; do not claim unmeasured capacity.
8. Commit task-only changes and create a PR. Document infrastructure IDs, recovery procedure, verification evidence and remaining dependencies.

## Progress

- Confirmed authenticated AWS console access and existing t3.large production instance.
- PR83 merged; implementation branch created from 5db0b53923f95785616486dea482781bd3d5886a.
- Existing deployment stops and restarts both roles together; must become role-specific.
- Existing S3 mirror adapter found; publication ordering and all local readers still need investigation.

## Acceptance

Web and worker run on separate hosts, deploy independently, read shared persisted results without a shared disk, and complete one real research. PEM is available privately on the user's machine. No load balancer or autoscaling is introduced. Existing reports, account ownership and research credits remain intact.

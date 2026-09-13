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

- Independent web and worker entry points/images implemented; PR84 created from the merged PR83 release.
- S3 reconciliation complete: all 4,109 distinct artifact digests exist remotely; fresh web reads work without a populated local cache.
- Web t3.medium provisioned with scoped IAM, security groups, PEM and shared RDS access. Existing t3.large retained for worker.
- CloudFormation EIP-only cutover completed; public IP now targets web. Old web/nginx stopped; worker runs independently.
- Worker readiness and an actual drain/redeploy passed. Host certificate mount retained; health CLI database cleanup corrected.
- Reader test reached 25/50/100; 100-reader errors stopped the run before 200. Results and limitations documented.
- Browser-triggered MSFT financial research published with limitations after navigating home. Its owner result rendered on the separate web host. QA also fixed the pre-existing onboarding category mismatch, ambiguous reservation SQL, and internal editorial length cap.
- Runtime implementation CI passed at f3ab675. Final documentation records the production split, restored EIPs, certificate renewal, qualified publication and measured load limitations. PR84 remains the required reviewed path for future role-specific main-branch deployments.

## Acceptance

Web and worker run on separate hosts, deploy independently, read shared persisted results without a shared disk, and complete one real research. PEM is available privately on the user's machine. No load balancer or autoscaling is introduced. Existing reports, account ownership and research credits remain intact.

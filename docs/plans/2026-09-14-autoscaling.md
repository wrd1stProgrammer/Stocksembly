# Single-instance baseline and autoscaling preparation

## Constraints

- Keep exactly one web instance and one worker now. Do not launch a second instance for testing, deployment, or migration.
- Web: introduce an ALB and a launch-template-backed Auto Scaling Group, minimum/desired 1. Future scale-out is bounded; no claim of immediate high availability with only one web.
- Worker: measure PostgreSQL's authoritative queue and execution duration first. Keep scaling disabled until the global runtime lease, shared admission limits, credential provisioning, and safe termination have been addressed and measured.
- Preserve existing production data and running research. Do not build on the serving web host. Keep PR review protection.

## Delivery sequence

1. In progress: replace homepage external ticker searches and localization writes with read-only public metadata loading; coalesce/cache public rows for 30 seconds and apply access decisions per request. Verify cache isolation and failure retry.
2. Pending: provision ALB, target group, web launch template/bootstrap and ASG around the existing instance; retain minimum/desired 1. Preserve HTTPS, forwarded headers and event streams. Configure future scale-out without initiating extra capacity.
3. Pending: configure safe deployment discovery and durable bootstrap release/configuration. Confirm a new host does not depend on the old host's filesystem or EIP.
4. Pending: publish real worker queue/processing metrics; prepare alarms with scaling actions disabled. Document blockers to multi-worker activation rather than enabling a nonfunctional policy.
5. Pending: focused tests, live HTTP/browser inspection, and AWS count/configuration checks. Create PR and record any DNS/login dependency that prevents public cutover.

## Findings

- Landing currently calls ticker search for up to three symbols; search calls external providers and upserts all results.
- Landing requests the full catalog counts/facets and writes original question localizations; it can invoke translations during the request.
- Production web and worker already run separately; latest main deployment succeeded.
- DNS is hosted at Gabia, not Route 53. Public ALB cutover requires Gabia DNS access (and apex alias support or a deliberate DNS migration).
- Research runtime holds a global PostgreSQL advisory lock. Adding worker instances without changing admission is not useful.

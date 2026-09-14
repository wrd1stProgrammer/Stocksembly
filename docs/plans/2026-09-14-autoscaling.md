# Single-instance baseline and autoscaling preparation

## Constraints

- Keep exactly one web instance and one worker now. Do not launch a second instance for testing, deployment, or migration.
- Web: introduce an ALB and a launch-template-backed Auto Scaling Group, minimum/desired 1. Future scale-out is bounded; no claim of immediate high availability with only one web.
- Worker: measure PostgreSQL's authoritative queue and execution duration first. Keep scaling disabled until the global runtime lease, shared admission limits, credential provisioning, and safe termination have been addressed and measured.
- Preserve existing production data and running research. Do not build on the serving web host. Keep PR review protection.

## Delivery sequence

1. Completed: replace homepage external ticker searches and localization writes with read-only public metadata loading; coalesce/cache public rows for 30 seconds and apply access decisions per request. Verify cache isolation and failure retry.
2. Completed: provision ALB, target group, web launch template/bootstrap and ASG around the existing instance; retain minimum/desired 1. Preserve HTTPS, forwarded headers and event streams. Configure future scale-out without initiating extra capacity.
3. Completed: implement deployment discovery and durable bootstrap release/configuration. The existing host successfully saved its configuration to Secrets Manager. Cold-host launch remains deliberately untested under the one-instance constraint; the image pointer now references the CI-built, live-validated application image in ECR.
4. Completed: publish real worker queue/processing metrics; prepare alarms with scaling actions disabled. Document blockers to multi-worker activation rather than enabling a nonfunctional policy.
5. Completed: focused tests, GitHub runtime builds and PostgreSQL integration, live HTTP through ALB, and initial AWS count checks. Production now serves the new web image. After Mac unlock, completed browser inspection, final AWS policy/dashboard changes, image reconciliation, and temporary IAM cleanup.

## Findings

- Landing currently calls ticker search for up to three symbols; search calls external providers and upserts all results.
- Landing requests the full catalog counts/facets and writes original question localizations; it can invoke translations during the request.
- Production web and worker already run separately; latest main deployment succeeded.
- DNS is hosted at Gabia, not Route 53. Public ALB cutover requires Gabia DNS access (and apex alias support or a deliberate DNS migration).
- Research runtime holds a global PostgreSQL advisory lock. Adding worker instances without changing admission is not useful.

## Live progress

- Route 53 hosted zone `Z044189323GHK84C284NV` contains the original A/TXT records and ACM validation records. Gabia owner authentication and delegation change completed; registration remains at Gabia.
- ACM certificate issued; ALB HTTPS returned HTTP 200 before alias cutover. Old direct EIP remains for cached DNS clients.
- Existing web is attached to `stocksembly-web`, minimum/desired/maximum currently 1 while deployment is prepared. No extra web/worker was launched.
- Worker queue metrics timer is active and CloudWatch receives the aggregate metrics. Worker scaling actions are disabled.
- Cache isolation/failure tests and typecheck passed. GitHub quality job, including PostgreSQL catalog integration and both runtime builds, passed for application commit `d6cab57`.
- The supervised web deployment of `d6cab573f378e7d474bcce068d531ee30ba36504` succeeded. `/api/health` returned `{"status":"ok"}` through the ALB. Three local-origin home requests completed in 81–97 ms; this is a small HTML-response sample, not browser rendering or a concurrency test. Public home returned HTTP 200.
- Final console work completed: `/api/health` target checks, ASG ELB health (900-second grace), CPU 35 policy, monitoring dashboard, ECR/bootstrap image alignment, and temporary IAM policy removal. Group maximum remains one and AlarmNotification remains suspended. No automatic scale-out is claimed.
- Browser rendering was checked for signed-in home and anonymous landing/office. Cold-host replacement remains deliberately untested and requires a separately scheduled operational drill. PR #86 quality checks passed at `b8e836285ef9b19a629247489bdc241419a7788c`; subsequent changes only update these operations records.

# Web and worker deployment

## Runtime boundaries

`apps/web` owns the Next.js container. `apps/worker` owns the research and briefing container. Both use the same repository's domain and PostgreSQL code; source directories were not duplicated. A UI-only change deploys web, a worker entry-point change deploys worker, and changes to shared code deploy both.

The web process accepts requests, reads reports and streams persisted progress. The worker executes leased jobs and publishes artifacts. RDS stores shared metadata; private S3 stores report/evidence/chart artifacts. Local worker files contain its credential runtime, temporary work and caches. Local caches and migration backups are retained and are not shared-disk dependencies.

## AWS resources

| Role | Instance | Size | Private address |
| --- | --- | --- | --- |
| Web | `i-07b01a4145abcedd1` | `t3.medium` | `10.24.1.12` |
| Worker | `i-030eacac11712c94d` | `t3.large` | `10.24.1.230` |

Public traffic remains on `34.226.129.32`, now attached to web. The worker uses `44.193.215.183` for outbound connectivity and administrative access. The CloudFormation update completed with only the application EIP association changed and the worker EIP added; no instance or database was replaced. The old web container and old nginx/certificate-renewal timer are stopped.

The web host is provisioned by `infra/aws/provision-split-web.py`; it is outside the original CloudFormation stack's instance lifecycle. The existing `stocksembly-prod` stack owns the stable application EIP and conditional worker EIP. Set `SeparateWebInstanceId` to the web instance. `PinnedApplicationAmi` deliberately keeps the existing AMI during this network-only update: resolving the latest SSM AMI would otherwise replace the worker.

The web security group permits public HTTP/HTTPS and SSH from the original worker security group only. RDS permits PostgreSQL from both runtime groups. Web IAM permits artifact reads, queue submission, database-secret reads, ECR pulls and SSM. It does not receive the worker's Codex credential directory. The worker keeps its existing execution identity.

The new RSA key pair is `stocksembly-web-worker-20260913`. Its PEM is stored in the user's private `keys` directory with mode `0400`, outside Git. The existing worker still uses `s1`. Never copy either key to an instance or put it in a build context.

## Deployment and recovery

GitHub repository variables `WEB_INSTANCE_ID` and `WORKER_INSTANCE_ID` select the SSM targets. The deployment role's existing SSM policy now includes the new web instance, and its repository-scoped ECR policy includes `DescribeImages`. Other permissions were preserved. `provision-split-web.py` records these narrow additions.

Production images use `web-sha-<commit>` / `worker-sha-<commit>`. `role-deploy.sh` only replaces the chosen role and restores its previous image on failed health checks. Production workflow runs are not cancelled when another push arrives. Worker deployment requests a drain, stops claiming work, maintains heartbeats and waits for active attempts before replacing the container.

The first upgrade from the legacy worker requires a supervised idle transition because the legacy image has no drain acknowledgement. Briefly suspend new research submissions, confirm there are no leased/running attempts, stop and preserve the legacy container, start the new worker, and restore submissions. Keep the preserved image/container until the new worker's actual research succeeds. Do not upload over a shell script while it is running; publish a new file and invoke it only after the prior process exits.

The worker mounts the pinned host CA bundle read-only as well as its Codex runtime. Removing the CA mount fails the isolation readiness check. The new web host has the existing Let's Encrypt certificate and `certbot-renew.timer`; renewal ownership must move with public traffic.

If a role deployment fails, inspect its container logs and health result before retrying. Do not delete PostgreSQL rows, S3 objects, authentication files or lease records to force startup. Network rollback reassigns the application EIP to the old instance through a reviewed CloudFormation change set and restarts its preserved web container.

## Verification scope

All 4,109 distinct persisted artifact digests were verified against S3, with zero missing objects and no upload required. A fresh web host with an empty artifact directory returned the historical TSLA report successfully. Separate Linux Docker images were built, and the worker's packaged imports passed without repository dependencies.

The staged reader script uses real HTTPS and certificate verification for the home page, research index and one public historical report. Its 25/50/100/200 simulated readers pause three seconds between requests. It does not represent hundreds of simultaneous model runs, authenticated SSE connections or sustained CPU-credit capacity. Load results and the actual research outcome are recorded after cutover.

ALB, web replicas, worker autoscaling and Lambda are outside this change.

### Reader test, 2026-09-13 (Korea to us-east-1)

| Simulated readers | Requests | Errors | p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| 25 | 139 | 0 | 2.139 s | 6.959 s |
| 50 | 215 | 0 | 3.735 s | 10.310 s |
| 100 | 100 | 32 | 11.056 s | 17.768 s |

The run stopped automatically at the 100-reader stage; 200 readers were not attempted. This workload includes full report HTML downloads across the Pacific, not static CDN images, and uses a socket inactivity timeout rather than a total request deadline. It is not an estimate of the maximum number of logged-in users. The observed response degradation means this single web process has not demonstrated acceptable capacity for this workload. ALB/replicas and report rendering/caching need consideration before claiming higher concurrency.

### Runtime issues found during cutover

The first worker-only launch failed its pinned certificate check because the host CA mount was missing. The legacy worker was restored, the read-only mount was added, and the new worker then passed readiness. A subsequent normal drain/redeploy succeeded. Non-serving worker commands now close their PostgreSQL pool so a successful health check does not wait for idle connections to expire.

Browser QA also found a pre-existing onboarding failure: the UI submits `google`, `instagram`, `tiktok` or `x`, while the existing SQL constraint accepts broad categories. Persistence now maps Google to `search` and the social platforms to `social`; existing categories pass through. This preserves the existing schema and rollback compatibility instead of modifying an applied migration or weakening its constraint. The tradeoff is that the stored discovery field remains category-level, not platform-level.

Web memory samples during the reader test peaked at 507 MiB; sampled process CPU reached 104.79% (approximately one vCPU). Sampling is not a continuous peak measurement. Image builds were finished before the reader run. A later web rebuild for the onboarding correction was not included in those measurements.

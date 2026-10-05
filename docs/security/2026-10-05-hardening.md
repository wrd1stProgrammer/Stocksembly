# Security report remediation — 2026-10-05

Source: security-report-2026-09-30.md. This change addresses the report against current main, rather than applying its example snippets verbatim.

| Finding | Implementation | Operational boundary |
| --- | --- | --- |
| H-1 SSRF | Validate paths before and after URL parsing; reject backslashes, control characters, encoded separators, API recursion and redirects; sanitize upstream failures. | Public Markdown conversion remains available with a request budget. No shared rewrite secret is needed for these URL restrictions. |
| M-1 Redirect | Shared same-origin destination validator for sign-in and callback. | Normal local paths with query strings and fragments remain supported. |
| M-2 Secrets | Publish provider configuration to Secrets Manager; EC2 retrieves it before replacing its environment atomically. SSM no longer contains provider credential payloads. | One-time secret/IAM setup must precede deployment. Old SSM history is not erased and existing provider credentials are not rotated by this change. |
| M-3 Authentication | Reject missing public origin in production and missing/partial Cognito configuration for public origins before opening the DB. | Explicit loopback environments retain local authentication for local testing. |
| L-1 CSRF | Shared exact-origin, fetch-site, JSON media type and 64 KiB body guard for the listed mutation routes. | Bodyless mutations remain supported. Existing browser clients send Origin automatically. |
| L-2 Headers | CSP frame-ancestors/object/base restrictions, nosniff, strict referrer policy, one-day HSTS. | This is a narrow enforced CSP, not a complete script-source policy. CDN and nginx-generated responses require separate header configuration. |
| L-3 Budgets | Bounded per-process rate limits; 60-second search and 15-second quote caches with in-flight deduplication. | Not a distributed fleet-wide quota or WAF. Peer identity relies on the trusted ALB forwarding chain. |
| L-4 Translation | Credit reservation and job admission share one DB transaction. Worker settlement marks completion or refunds failed reservations, fenced by lease token. | Concurrent and duplicate requests cannot bypass the available balance. Existing in-flight jobs from before rollout have no new reservation metadata. |
| I-1 Identifiers | Cognito GitHub variables and environment-configured infrastructure identifiers. | Identifiers are not secrets. Git history is unchanged. |
| I-2 Logout | Persist revoked Cognito session-family hashes and check bearer/cookie authentication and session bootstrap. | Revokes the current session family, not all devices. Requires migration 008. |
| I-3 Dependencies | Update vulnerable runtime dependencies, weekly Dependabot groups, production audit CI gate. | Audit reflects the registry advisories available when checked; it is not a complete security proof. |

## Deployment order

1. Create `stocksembly/prod/providers` and grant exact-secret permissions using `infra/aws/configure-provider-secret.py` with `WEB_RUNTIME_ROLE`, `WORKER_RUNTIME_ROLE`, `DEPLOY_ROLE`, and `AWS_REGION`. Web and worker receive GetSecretValue; GitHub deployment receives PutSecretValue only.
2. Confirm repository variables `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and `COGNITO_DOMAIN`. These were populated during this task.
3. Merge and run the normal pipeline. It publishes the provider JSON from existing GitHub secrets, then deploys. Runtime secret retrieval failure leaves existing containers running.
4. Research DB initialization applies migration 008 before the new authentication layer queries it. Verify a sign-in/logout cycle after rollout.
5. Review retained SSM command access and rotate provider keys if exposure is suspected. Rotation must coordinate provider dashboards, GitHub secrets and deployment; this change does not invent or replace credentials.

## Validation

- Web production build passed with Node 20.20.2 and Next 16.3.6.
- TypeScript check passed.
- Targeted authorization, redirect, request-guard, route and PostgreSQL translation tests passed. Tests cover concurrent admission, last-credit use, admission rollback, failure refund, duplicate job reuse and logout token rejection.
- Production dependency audit reports zero known vulnerabilities after dependency updates.
- Shell and Python syntax checks passed.
- Local production HTTP checks returned 403 for cross-origin mutation and 400 for malformed Markdown source, with the expected security headers.
- The isolated local server has no production DB cutover configuration: the home request was rejected with RESEARCH_POSTGRES_CUTOVER_NOT_READY. A successful authenticated full-site smoke test and production rollout are not claimed.

No paid research runs or load tests were performed. The primary checkout's unrelated work was preserved. AWS setup was approved and completed: `stocksembly/prod/providers` was created in us-east-1; its exact ARN was granted to the web and worker roles for GetSecretValue and the GitHub deployment role for PutSecretValue. Each inline policy was read back and compared with the intended policy. No secret value was copied into the browser or command history. The first deployment of this branch populates the value from existing GitHub secrets. The branch is not yet committed or pushed.

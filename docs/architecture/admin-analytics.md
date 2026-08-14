# Admin analytics dashboard

The administrator dashboard is available at `/admin` and is protected on the
server. A request must carry a verified Cognito access token whose
`cognito:groups` claim contains the exact value `admin`. Local automation
credentials and ordinary Cognito users are rejected.

## Enablement

Both flags accept only the literal value `true` and otherwise fail closed:

```text
STOCKSEMBLY_ADMIN_ANALYTICS_READS_ENABLED=true
STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED=true
```

`READS` controls the page and read APIs. `WRITES` controls first-touch
attribution, checkout-attempt correlation, payment events and the analytics
consent surface. Keep both false until migration 12 has been applied and the
privacy notice is ready.

The CloudFormation stack creates the Cognito group but does not add a user.
Assign an administrator explicitly, then sign out and sign back in so Cognito
issues a fresh access token:

```sh
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <pool-id> \
  --username <cognito-username> \
  --group-name admin
```

## Routes

- `/admin`: overview, trends, funnels, acquisition, retention and users.
- `/admin/users/:principalId`: bounded, redacted user activity timeline.
- `/api/admin/analytics/overview`: overview JSON.
- `/api/admin/analytics/users`: paginated user list JSON.
- `/api/admin/analytics/users/:principalId`: one user and up to 100 actions.

All responses are private and `no-store`. Unauthenticated requests return 401,
authenticated non-admin requests return 403, and a disabled surface returns
404.

## Metric notes

Calendar bucketing uses `Asia/Seoul` and half-open ranges. Signup means first
authenticated Stocksembly use. Meaningful activity excludes login and billing
navigation. A zero funnel denominator is rendered as unavailable, never `0%`.
Historical usage is reconstructed from existing domain records and is labeled
estimated/partial; first-touch and checkout conversion become exact only for
events collected after migration 12 and write-gate enablement.

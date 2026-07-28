# Stocksembly AWS sandbox

This stack is the low-cost production foundation for the five-month AWS
Innovation Sandbox. It is region-neutral and creates one application host, a private PostgreSQL
database, an artifact bucket, a research queue with a dead-letter queue, and a
Cognito user pool.

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

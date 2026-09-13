#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/stocksembly-worker-metrics.lock
flock -n 9 || exit 0
metrics="$(mktemp /run/stocksembly-worker-metrics.XXXXXX)"
trap 'rm -f "$metrics"' EXIT
# Read the real PostgreSQL queue; SQS is only a wake-up hint in this application.
timeout 40 docker exec -i -w /app stocksembly-worker node --input-type=module < /opt/stocksembly/worker-queue-metrics.mjs > "$metrics"
aws cloudwatch put-metric-data --region us-east-1 --namespace Stocksembly/Research --metric-data "file://$metrics"

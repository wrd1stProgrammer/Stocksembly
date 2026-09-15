#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 2 || ! "$1" =~ ^(web|worker)$ ]]; then
  echo 'usage: role-deploy.sh <web|worker> <immutable-ecr-image>' >&2
  exit 64
fi
role="$1"
image="$2"
name="stocksembly-${role}"
registry="${image%%/*}"
region="$(cut -d. -f4 <<<"$registry")"
install -d -m 0700 /opt/stocksembly/container
exec 9>"/opt/stocksembly/container/${role}.deploy.lock"
flock -n 9 || { echo 'Another role deployment is active' >&2; exit 75; }
args=(--env-file /etc/stocksembly/aws.env --env-file /etc/stocksembly/app.env)
for key in STOCKSEMBLY_ARTIFACT_BUCKET AWS_REGION STOCKSEMBLY_DATA_DIR; do
  grep -Eq "^${key}=.+" /etc/stocksembly/aws.env /etc/stocksembly/app.env || { echo "Missing ${key}" >&2; exit 78; }
done
ready="$(sed -n 's/^STOCKSEMBLY_RESEARCH_POSTGRES_READY=//p' /etc/stocksembly/aws.env /etc/stocksembly/app.env | tail -1)"
[[ "$ready" == true ]] || { echo 'PostgreSQL cutover is not verified' >&2; exit 78; }
previous="$(docker inspect --format '{{.Config.Image}}' "$name" 2>/dev/null || true)"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"
  docker pull "$image"
fi
start_role() {
  local target="$1"
  docker rm --force "$name" >/dev/null 2>&1 || true
  local mounts=(--volume /var/lib/stocksembly/research:/var/lib/stocksembly/research)
  local command=(node server.js)
  if [[ "$role" == worker ]]; then
    mounts+=(--volume /home/ec2-user/.codex:/home/ec2-user/.codex
      --volume /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:ro)
    command=(node research-worker/worker.mjs serve)
  fi
  docker run --detach --name "$name" --restart always --network host \
    --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
    "${args[@]}" "${mounts[@]}" --env NODE_ENV=production \
    --env HOSTNAME=127.0.0.1 --env PORT=3000 \
    "$target" "${command[@]}" >/dev/null
}
# Drain only after the new image has been pulled successfully. The old worker
# keeps heartbeats and finishes in-flight attempts before acknowledging readiness.
if [[ "$role" == worker ]] && [[ -n "$previous" ]]; then
  docker exec "$name" node -e 'if (!process.env.STOCKSEMBLY_ARTIFACT_BUCKET) process.exit(1)'
  docker exec "$name" sh -c 'grep -q STOCKSEMBLY_WORKER_DRAIN_FILE research-worker/worker.mjs' || {
    echo 'Existing worker needs the initial supervised drain upgrade' >&2; exit 78;
  }
  docker exec "$name" touch /tmp/stocksembly-worker-drain
  drained=false
  for attempt in {1..360}; do
    if docker exec "$name" test -f /tmp/stocksembly-worker-drain.ready; then drained=true; break; fi
    sleep 5
  done
  [[ "$drained" == true ]] || { echo 'Drain timed out; existing worker was not stopped' >&2; exit 75; }
fi
docker stop --time 60 "$name" >/dev/null 2>&1 || true
start_role "$image"
healthy() {
  [[ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null)" == true ]] || return 1
  if [[ "$role" == web ]]; then
    curl --fail --silent --max-time 5 http://127.0.0.1:3000/ >/dev/null
  else
    docker exec "$name" node research-worker/worker.mjs health >/dev/null 2>&1
  fi
}
for attempt in {1..30}; do
  if healthy; then
    sleep 3
    if healthy; then
      if [[ -n "$previous" && "$previous" != "$image" ]]; then
        printf '%s\n' "$previous" > "/opt/stocksembly/container/${role}.rollback-image"
      fi
      printf 'STOCKSEMBLY_IMAGE=%s\n' "$image" > "/opt/stocksembly/container/${role}.image.env"
      if [[ "$role" == web && -f /etc/stocksembly/asg-web ]]; then
        # Persist the successfully deployed environment for future ASG instances.
        config_file="$(mktemp /run/stocksembly-web-config.XXXXXX)"
        chmod 0600 "$config_file"
        python3 - "$config_file" <<'PYCONFIG'
import json, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(json.dumps({
    "awsEnv": pathlib.Path('/etc/stocksembly/aws.env').read_text(),
    "appEnv": pathlib.Path('/etc/stocksembly/app.env').read_text(),
}))
PYCONFIG
        if ! aws secretsmanager put-secret-value --region "$region" --secret-id stocksembly/prod/web-bootstrap --secret-string "file://$config_file" --query ARN --output text; then
          rm -f "$config_file"
          exit 1
        fi
        rm -f "$config_file"
      fi
      exit 0
    fi
  fi
  sleep 2
done
if [[ -n "$previous" ]]; then start_role "$previous"; fi
echo "${role} health check failed; previous image restored when available" >&2
exit 1

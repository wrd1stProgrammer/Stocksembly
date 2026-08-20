#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <ecr-image-uri>" >&2
  exit 64
fi

image="$1"
deployment_directory="/opt/stocksembly/container"
environment_file="${deployment_directory}/image.env"
previous_image=""
native_web_active=false
native_worker_active=false

if [[ -f "$environment_file" ]]; then
  previous_image="$(sed -n 's/^STOCKSEMBLY_IMAGE=//p' "$environment_file")"
fi
if systemctl is-active --quiet stocksembly-web; then
  native_web_active=true
fi
if systemctl is-active --quiet stocksembly-worker; then
  native_worker_active=true
fi

registry="${image%%/*}"
region="$(cut -d. -f4 <<<"$registry")"
environment_arguments=(--env-file /etc/stocksembly/aws.env)
if [[ -f /etc/stocksembly/app.env ]]; then
  environment_arguments+=(--env-file /etc/stocksembly/app.env)
fi

require_environment_key() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]] || ! grep --quiet --extended-regexp "^${key}=.+" "$file"; then
    echo "required production environment is missing: ${key}" >&2
    exit 78
  fi
}

require_environment_key /etc/stocksembly/aws.env STOCKSEMBLY_DATA_DIR
require_environment_key /etc/stocksembly/app.env INSIGHTSENTRY_RAPIDAPI_KEY
require_environment_key /etc/stocksembly/app.env INSIGHTSENTRY_RAPIDAPI_HOST

start_containers() {
  local container_image="$1"

  docker stop --time 30 stocksembly-web stocksembly-worker >/dev/null 2>&1 || true
  docker rm --force stocksembly-web stocksembly-worker >/dev/null 2>&1 || true
  rm -f /var/lib/stocksembly/research/worker.lock
  docker run \
    --detach \
    --name stocksembly-web \
    --restart always \
    --network host \
    "${environment_arguments[@]}" \
    --env NODE_ENV=production \
    --env HOSTNAME=127.0.0.1 \
    --env PORT=3000 \
    --env LANG=en_US.UTF-8 \
    --env LC_ALL=en_US.UTF-8 \
    --env TMPDIR=/home/ec2-user/.codex/tmp \
    --volume /home/ec2-user/.codex:/home/ec2-user/.codex \
    --volume /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:ro \
    --volume /var/lib/stocksembly/research:/var/lib/stocksembly/research \
    "$container_image" \
    node server.js >/dev/null
  docker run \
    --detach \
    --name stocksembly-worker \
    --restart always \
    --network host \
    "${environment_arguments[@]}" \
    --env NODE_ENV=production \
    --env LANG=en_US.UTF-8 \
    --env LC_ALL=en_US.UTF-8 \
    --env TMPDIR=/home/ec2-user/.codex/tmp \
    --volume /home/ec2-user/.codex:/home/ec2-user/.codex \
    --volume /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem:ro \
    --volume /var/lib/stocksembly/research:/var/lib/stocksembly/research \
    "$container_image" \
    node research-worker/worker.mjs serve >/dev/null
}

aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "$registry"
docker pull "$image"
systemctl stop stocksembly-web stocksembly-worker
printf 'STOCKSEMBLY_IMAGE=%s\n' "$image" >"$environment_file"

start_containers "$image"

for attempt in {1..30}; do
  if [[ "$(docker inspect --format '{{.State.Running}}' stocksembly-web 2>/dev/null)" == "true" ]] &&
    [[ "$(docker inspect --format '{{.State.Running}}' stocksembly-worker 2>/dev/null)" == "true" ]] &&
    curl --fail --silent --max-time 3 http://127.0.0.1:3000/ >/dev/null; then
    sleep 5
    if [[ "$(docker inspect --format '{{.State.Running}}' stocksembly-web 2>/dev/null)" == "true" ]] &&
      [[ "$(docker inspect --format '{{.State.Running}}' stocksembly-worker 2>/dev/null)" == "true" ]] &&
      docker exec stocksembly-worker node research-worker/worker.mjs health >/dev/null 2>&1; then
      systemctl disable stocksembly-web stocksembly-worker >/dev/null
      docker image prune --force --filter "until=168h" >/dev/null
      exit 0
    fi
  fi
  sleep 2
done

echo "deployment health check failed; container state follows" >&2
docker inspect \
  --format '{{.Name}} status={{.State.Status}} running={{.State.Running}} restartCount={{.RestartCount}} exitCode={{.State.ExitCode}} error={{json .State.Error}}' \
  stocksembly-web stocksembly-worker >&2 || true
echo "stocksembly-web recent logs" >&2
docker logs --tail 80 stocksembly-web >&2 || true
echo "stocksembly-worker recent logs" >&2
docker logs --tail 80 stocksembly-worker >&2 || true

if [[ -n "$previous_image" ]]; then
  printf 'STOCKSEMBLY_IMAGE=%s\n' "$previous_image" >"$environment_file"
  start_containers "$previous_image"
else
  docker rm --force stocksembly-web stocksembly-worker >/dev/null 2>&1 || true
  if [[ "$native_web_active" == "true" ]]; then
    systemctl start stocksembly-web
  fi
  if [[ "$native_worker_active" == "true" ]]; then
    systemctl start stocksembly-worker
  fi
fi

exit 1

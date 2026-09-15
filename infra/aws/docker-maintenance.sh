#!/usr/bin/env bash
set -euo pipefail
# Share deployment locks: never remove an image between pull and container start.
install -d -m 0700 /opt/stocksembly/container
exec 8>/opt/stocksembly/container/web.deploy.lock
exec 9>/opt/stocksembly/container/worker.deploy.lock
flock -n 8 || exit 0
flock -n 9 || exit 0
echo 'Docker usage before maintenance'
docker system df
# Production hosts only pull images; retain recent cache for diagnostics.
docker builder prune --all --force --filter until=168h --keep-storage 2GB
# Keep every container-referenced image and the explicitly recorded rollback.
# Restrict removal to Stocksembly images older than seven days, without --force.
cutoff="$(date -d '7 days ago' +%s)"
for id in $(docker image ls --quiet --no-trunc | sort -u); do
  tags="$(docker image inspect --format '{{join .RepoTags " "}}' "$id")"
  [[ "$tags" == *'.amazonaws.com/stocksembly:'* || -z "$tags" ]] || continue
  created="$(docker image inspect --format '{{.Created}}' "$id")"
  [[ "$(date -d "$created" +%s)" -lt "$cutoff" ]] || continue
  protected=false
  for file in /opt/stocksembly/container/*.rollback-image; do
    [[ -f "$file" ]] || continue
    kept="$(docker image inspect --format '{{.Id}}' "$(cat "$file")" 2>/dev/null || true)"
    [[ "$kept" != "$id" ]] || protected=true
  done
  [[ "$protected" == false ]] || continue
  [[ -z "$(docker ps --all --quiet --filter ancestor="$id")" ]] || continue
  docker image rm "$id" || echo "Retained image $id (in use or multiple tags)"
done
echo 'Docker usage after maintenance'
docker system df

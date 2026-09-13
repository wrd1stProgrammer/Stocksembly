#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  echo 'Usage: publish-static-assets.sh BUCKET FULL_GIT_SHA [--dryrun]'
  echo 'Uploads tracked public/research/office-v* assets to an immutable release prefix.'
  exit 0
fi
bucket="${1:?S3 bucket required}"
revision="${2:?Full Git SHA required}"
[[ "$bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || { echo 'Invalid bucket' >&2; exit 1; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected full Git SHA' >&2; exit 1; }
[[ "$revision" == "$(git rev-parse HEAD)" ]] || { echo 'Release must match checkout' >&2; exit 1; }
arguments=()
if [[ "${3:-}" == "--dryrun" ]]; then arguments+=(--dryrun); elif [[ -n "${3:-}" ]]; then exit 1; fi
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
# Archive from Git so unrelated local files cannot be published.
git archive "$revision" -- public/research/office-v7 public/research/office-v8 public/research/office-v9 public/research/office-v10 | tar -x -C "$staging"
aws s3 sync "$staging/public/research/" "s3://${bucket}/releases/${revision}/research/" \
  --cache-control 'public,max-age=31536000,immutable' \
  --only-show-errors ${arguments[@]+"${arguments[@]}"}

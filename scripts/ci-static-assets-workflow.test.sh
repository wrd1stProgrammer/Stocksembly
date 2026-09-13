#!/usr/bin/env bash
set -euo pipefail

# Parse this named literal block so the PR checks the exact production shell.
workflow="${1:-.github/workflows/pipeline.yml}"
script="$(awk '
  /^      - name: Publish optional CloudFront office assets$/ { step = 1; next }
  step && /^        run: \|$/ { body = 1; next }
  body && /^          / { sub(/^          /, ""); print; next }
  body { exit }
' "$workflow")"
if [[ -z "$script" ]]; then
  echo 'CloudFront deployment shell block was not found' >&2
  exit 1
fi
bash -n <<< "$script"
echo 'CloudFront deployment shell syntax passed'

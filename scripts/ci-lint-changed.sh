#!/usr/bin/env bash

set -euo pipefail

base_sha="${1:-}"
zero_sha="0000000000000000000000000000000000000000"

if [[ -z "${base_sha}" || "${base_sha}" == "${zero_sha}" ]]; then
  echo "No previous baseline commit is available; changed-file lint is skipped."
  exit 0
fi

if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  echo "Baseline commit ${base_sha} is unavailable; changed-file lint is skipped."
  exit 0
fi

files=()
if [[ -n "${GITHUB_SHA:-}" ]]; then
  while IFS= read -r -d '' file; do
    files[${#files[@]}]="${file}"
  done < <(
    git diff --name-only -z --diff-filter=ACMR "${base_sha}" "${GITHUB_SHA}" -- \
      '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.css'
  )
else
  while IFS= read -r -d '' file; do
    files[${#files[@]}]="${file}"
  done < <(
    git diff --name-only -z --diff-filter=ACMR "${base_sha}" -- \
      '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.css'
  )
fi

if ((${#files[@]} == 0)); then
  echo "No Biome-supported files changed."
  exit 0
fi

pnpm exec biome check "${files[@]}"

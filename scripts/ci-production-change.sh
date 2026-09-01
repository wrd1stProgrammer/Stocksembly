#!/usr/bin/env bash

set -euo pipefail

base_sha="${1:-}"
target_sha="${GITHUB_SHA:-HEAD}"
zero_sha="0000000000000000000000000000000000000000"

if [[ -z "$base_sha" || "$base_sha" == "$zero_sha" ]]; then
  echo "No previous baseline commit is available; production deployment is required." >&2
  printf 'true\n'
  exit 0
fi

if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  echo "Baseline commit ${base_sha} is unavailable; production deployment is required." >&2
  printf 'true\n'
  exit 0
fi

while IFS= read -r -d '' file; do
  case "$file" in
    .github/* | docs/* | CONTRIBUTING.md | README | README.* | scripts/ci-lint-changed.sh | scripts/ci-lint-changed.test.sh | scripts/ci-production-change.sh | scripts/ci-production-change.test.sh)
      ;;
    *)
      echo "Production deployment is required by ${file}." >&2
      printf 'true\n'
      exit 0
      ;;
  esac
done < <(
  git diff --name-only -z --diff-filter=ACDMR "$base_sha" "$target_sha"
)

echo "Only repository documentation, templates, or CI helpers changed; production deployment is skipped." >&2
printf 'false\n'

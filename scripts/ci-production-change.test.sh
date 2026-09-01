#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/stocksembly-production-change.XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT

git -C "$fixture_root" init --quiet
git -C "$fixture_root" config user.email "ci-test@stocksembly.local"
git -C "$fixture_root" config user.name "Stocksembly CI"
mkdir -p "$fixture_root/app"
printf 'initial\n' >"$fixture_root/app/page.tsx"
git -C "$fixture_root" add app/page.tsx
git -C "$fixture_root" commit --quiet -m "initial"
base_sha="$(git -C "$fixture_root" rev-parse HEAD)"

mkdir -p \
  "$fixture_root/.github/ISSUE_TEMPLATE" \
  "$fixture_root/.github/workflows" \
  "$fixture_root/docs" \
  "$fixture_root/scripts"
printf 'template\n' >"$fixture_root/.github/PULL_REQUEST_TEMPLATE.md"
printf 'issue\n' >"$fixture_root/.github/ISSUE_TEMPLATE/feature_request.md"
printf 'workflow\n' >"$fixture_root/.github/workflows/pipeline.yml"
printf 'guide\n' >"$fixture_root/CONTRIBUTING.md"
printf 'architecture\n' >"$fixture_root/docs/architecture.md"
printf 'helper\n' >"$fixture_root/scripts/ci-production-change.sh"
git -C "$fixture_root" add .github CONTRIBUTING.md docs scripts
git -C "$fixture_root" commit --quiet -m "docs and ci only"
docs_sha="$(git -C "$fixture_root" rev-parse HEAD)"

docs_result="$(
  cd "$fixture_root"
  GITHUB_SHA="$docs_sha" /bin/bash \
    "$repository_root/scripts/ci-production-change.sh" "$base_sha"
)"
if [[ "$docs_result" != "false" ]]; then
  echo "Expected docs-only and CI-only changes to skip production deployment" >&2
  exit 1
fi

printf 'runtime change\n' >>"$fixture_root/app/page.tsx"
git -C "$fixture_root" add app/page.tsx
git -C "$fixture_root" commit --quiet -m "runtime change"
runtime_sha="$(git -C "$fixture_root" rev-parse HEAD)"

runtime_result="$(
  cd "$fixture_root"
  GITHUB_SHA="$runtime_sha" /bin/bash \
    "$repository_root/scripts/ci-production-change.sh" "$docs_sha"
)"
if [[ "$runtime_result" != "true" ]]; then
  echo "Expected an application change to require production deployment" >&2
  exit 1
fi

missing_base_result="$(
  cd "$fixture_root"
  GITHUB_SHA="$runtime_sha" /bin/bash \
    "$repository_root/scripts/ci-production-change.sh" \
    "0000000000000000000000000000000000000000"
)"
if [[ "$missing_base_result" != "true" ]]; then
  echo "Expected a missing baseline to require production deployment" >&2
  exit 1
fi

echo "Production change classifier skips repository-only changes and deploys runtime changes."

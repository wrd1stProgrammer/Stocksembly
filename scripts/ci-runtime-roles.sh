#!/usr/bin/env bash
set -euo pipefail
base="${1:-}"
target="${GITHUB_SHA:-HEAD}"
if [[ -z "$base" ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  printf '["web","worker"]\n'; exit 0
fi
web=false
worker=false
while IFS= read -r -d '' file; do
  case "$file" in
    docs/*|*.md) ;;
    app/*|src/components/*|src/styles/*|public/*|apps/web/*|scripts/prepare-web.mjs|next.config.*|src/App.tsx) web=true ;;
    apps/worker/*|scripts/standalone-worker-entry.mjs) worker=true ;;
    *) web=true; worker=true ;;
  esac
done < <(git diff --name-only -z "$base" "$target")
if [[ "$web" == true && "$worker" == false ]]; then printf '["web"]\n'
elif [[ "$worker" == true && "$web" == false ]]; then printf '["worker"]\n'
else printf '["web","worker"]\n'
fi

#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
fixture_path="scripts/ci lint changed fixture $$.js"
capture_root="$(mktemp -d "${TMPDIR:-/tmp}/stocksembly-ci-lint.XXXXXX")"
fake_bin="${capture_root}/bin"
capture_file="${capture_root}/arguments.txt"

cleanup() {
  git -C "${repository_root}" reset -q HEAD -- "${fixture_path}" 2>/dev/null || true
  rm -f "${repository_root}/${fixture_path}"
  rm -rf "${capture_root}"
}
trap cleanup EXIT

mkdir -p "${fake_bin}"
printf '%s\n' 'const fixture = true;' > "${repository_root}/${fixture_path}"
git -C "${repository_root}" add -N -- "${fixture_path}"

cat > "${fake_bin}/pnpm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${CI_LINT_CAPTURE_FILE}"
EOF
chmod +x "${fake_bin}/pnpm"

PATH="${fake_bin}:${PATH}" \
  CI_LINT_CAPTURE_FILE="${capture_file}" \
  GITHUB_SHA="" \
  /bin/bash "${repository_root}/scripts/ci-lint-changed.sh" HEAD

matches="$(grep -Fxc "${fixture_path}" "${capture_file}")"
if [[ "${matches}" != "1" ]]; then
  echo "Expected one intact changed-file argument for: ${fixture_path}" >&2
  exit 1
fi

echo "Bash 3 changed-file collector preserved one filename-with-spaces argument."

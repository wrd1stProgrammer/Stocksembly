#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <ApplicationPublicIp>" >&2
  exit 64
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="$1"
key_path="${STOCKSEMBLY_SSH_KEY_PATH:-/Users/minsikchae/Downloads/stocksembly-prod-20260728.pem}"
public_origin="${STOCKSEMBLY_PUBLIC_ORIGIN_OVERRIDE:-http://${host}}"
archive="$(mktemp -t stocksembly-deploy.XXXXXX.tar.gz)"
trap 'rm -f "$archive"' EXIT

if [[ ! -f "$key_path" ]]; then
  echo "missing SSH key: $key_path" >&2
  exit 66
fi

COPYFILE_DISABLE=1 tar \
  --no-xattrs \
  --exclude='.env*' \
	  --exclude='.codegraph' \
	  --exclude='.debug-journal.md' \
  --exclude='.next' \
  --exclude='.omo' \
  --exclude='.stocksembly-verification' \
  --exclude='assets' \
  --exclude='design' \
  --exclude='dist' \
  --exclude='node_modules' \
  --exclude='output' \
  --exclude='outputs' \
  --exclude='research-data' \
  --exclude='test-results' \
  --exclude='tmp' \
  --exclude='playwright-report' \
  -czf "$archive" \
  -C "$project_root" .

scp -i "$key_path" -o StrictHostKeyChecking=accept-new \
  "$archive" "ec2-user@${host}:/tmp/stocksembly-app.tar.gz"
scp -i "$key_path" -o StrictHostKeyChecking=accept-new \
  "$project_root/infra/aws/stocksembly-web.service" \
  "$project_root/infra/aws/stocksembly-worker.service" \
  "ec2-user@${host}:/tmp/"

ssh -i "$key_path" -o StrictHostKeyChecking=accept-new "ec2-user@${host}" \
  'bash -se' -- "$public_origin" <<'REMOTE'
   public_origin="$1"
   sudo systemctl stop stocksembly-web stocksembly-worker 2>/dev/null || true
   sudo dnf install -y gcc-c++ make python3
   sudo rm -rf /opt/stocksembly/app
   sudo install -d -m 0755 -o ec2-user -g ec2-user /opt/stocksembly/app
   tar -xzf /tmp/stocksembly-app.tar.gz -C /opt/stocksembly/app
   cd /opt/stocksembly/app
   corepack prepare pnpm@10.34.1 --activate
   pnpm install --frozen-lockfile
   pnpm build
   sudo sed -i '/^STOCKSEMBLY_PUBLIC_ORIGIN=/d' /etc/stocksembly/aws.env
   printf 'STOCKSEMBLY_PUBLIC_ORIGIN=%s\n' "$public_origin" |
     sudo tee -a /etc/stocksembly/aws.env >/dev/null
   sudo install -m 0644 /tmp/stocksembly-web.service /etc/systemd/system/
   sudo install -m 0644 /tmp/stocksembly-worker.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now stocksembly-web
   if /home/ec2-user/.local/bin/codex login status >/dev/null 2>&1; then
     sudo systemctl enable --now stocksembly-worker
   else
     sudo systemctl disable --now stocksembly-worker
   fi
   rm -f /tmp/stocksembly-app.tar.gz /tmp/stocksembly-web.service /tmp/stocksembly-worker.service
REMOTE

#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
install -m 0755 "$source_dir/docker-maintenance.sh" /usr/local/bin/stocksembly-docker-maintenance
cat > /etc/systemd/system/stocksembly-docker-maintenance.service <<'UNIT'
[Unit]
Description=Stocksembly unused Docker cache and image maintenance
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/stocksembly-docker-maintenance
Nice=15
IOSchedulingClass=idle
TimeoutStartSec=30min
UNIT
cat > /etc/systemd/system/stocksembly-docker-maintenance.timer <<'UNIT'
[Unit]
Description=Daily Stocksembly Docker maintenance
[Timer]
OnCalendar=*-*-* 19:00:00 UTC
RandomizedDelaySec=30m
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now stocksembly-docker-maintenance.timer

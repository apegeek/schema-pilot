#!/usr/bin/env bash
set -e
NAME="${1:-schema-pilot}"
WORKDIR="${2:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE="/etc/systemd/system/${NAME}.service"
printf "[Unit]\nDescription=SchemaPilot Node Server\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=%s\nEnvironment=NODE_ENV=production\nEnvironment=PORT=${PORT:-4000}\nExecStart=/usr/bin/node server/server.js\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=multi-user.target\n" "$WORKDIR" | sudo tee "$SERVICE" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$NAME"


#!/usr/bin/env bash
#
# ec2-deploy.sh — deploy/update the Ontario Land Use Chat on the EC2 instance.
#
# Run ON the EC2 instance (either via SSH from the Makefile `ec2-deploy`
# target, or directly on the box). Requires the repo to already be cloned
# at /opt/ontario-land-use-chat and the systemd unit installed.
#
# Usage:
#   make ec2-deploy                                  # from local Mac
#   ssh -i KEY ubuntu@HOST 'bash -s' < deploy/scripts/ec2-deploy.sh
#   cd /opt/ontario-land-use-chat && bash deploy/scripts/ec2-deploy.sh
#
set -euo pipefail

APP_DIR="/opt/ontario-land-use-chat"
SERVICE="ontario-land-use-chat"
HEALTH_URL="http://localhost:3000/login"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

cd "$APP_DIR"

log "Pulling latest code…"
git fetch --prune
git pull --ff-only

log "Installing dependencies (frozen lockfile)…"
bun install --frozen-lockfile

log "Building production bundle…"
bun run build

log "Restarting service…"
sudo systemctl restart "$SERVICE"

log "Waiting for service to come up…"
sleep 3

if systemctl is-active --quiet "$SERVICE"; then
  log "Service is active."
  code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
  log "Health check $HEALTH_URL → HTTP $code"
  if [ "$code" = "200" ]; then
    log "Deploy complete ✓"
  else
    log "WARN: service is running but health check returned $code"
    log "Last 20 log lines:"
    journalctl -u "$SERVICE" --no-pager -n 20
  fi
else
  log "ERROR: service failed to start!"
  journalctl -u "$SERVICE" --no-pager -n 40
  exit 1
fi
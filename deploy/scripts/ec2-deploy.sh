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

# Non-interactive SSH sessions don't source .bashrc, so bun (installed to
# ~/.bun/bin by bun.sh/install) isn't on PATH. Prepend it.
export PATH="$HOME/.bun/bin:$PATH"

# The Vite production build (client env) is memory-hungry — on a ~2 GB EC2
# instance it OOMs before the AI Elements/Streamdown/Shiki deps are bundled.
# A 2 GB swap file (created at provisioning) plus a raised V8 heap ceiling
# lets the build spill to swap and finish. Keep this even after an instance
# upgrade; it's a no-op where memory is plentiful.
#
# 2048 was the original setting but the build now needs >2 GB (it OOM'd at the
# default ~972 MB heap during a deploy); 3072 lets it spill into swap and
# completes in under a minute. Verified working 2026-07-23.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=3072"
if ! swapon --show | grep -q .; then
  log "No swap detected; creating a 2 GB swap file so the build can finish…"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

cd "$APP_DIR"

log "Pulling latest code…"
git fetch --prune
git pull --ff-only

log "Installing dependencies (frozen lockfile)…"
bun install --frozen-lockfile

log "Building production bundle (NODE_OPTIONS=$NODE_OPTIONS)…"
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
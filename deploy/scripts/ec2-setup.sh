#!/usr/bin/env bash
#
# ec2-setup.sh — one-time provisioning for the Ontario Land Use Chat on EC2.
#
# Run via:  make ec2-setup
#   (which does: ssh ... 'bash -s' < deploy/scripts/ec2-setup.sh)
#
# Idempotent-ish: safe to re-run. Installs Node.js LTS, Bun, nginx, ufw,
# clones the repo to /opt/ontario-land-use-chat, and configures the firewall.
#
set -euo pipefail

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

APP_DIR="/opt/ontario-land-use-chat"
SERVICE="ontario-land-use-chat"

# ─── 1. System packages ─────────────────────────────────────────────────
log "Updating apt + installing base packages…"
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git unzip build-essential nginx ufw ca-certificates \
    software-properties-common

# ─── 2. Node.js LTS (for react-router-serve) ────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 22.x…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
log "node: $(node --version)"

# ─── 3. Bun ──────────────────────────────────────────────────────────────
if ! command -v bun >/dev/null 2>&1; then
  log "Installing Bun…"
  curl -fsSL https://bun.sh/install | bash
  # Source for this session (the installer appends to .bashrc for future shells)
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
log "bun: $(bun --version)"

# ─── 4. Clone the repo ──────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  log "Creating $APP_DIR and cloning repo…"
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  # If the repo is private, set up SSH keys or a deploy token on EC2 first,
  # then update the URL below.
  git clone https://github.com/viraniaman94/ontario-land-use-chat.git "$APP_DIR" \
    || { log "ERROR: clone failed. Check the repo URL in deploy/scripts/ec2-setup.sh"; exit 1; }
else
  log "Repo already cloned at $APP_DIR."
fi

cd "$APP_DIR"
log "Installing dependencies…"
bun install

# ─── 5. Skill documents directory ──────────────────────────────────────
# The skill scaffolding (SKILL.md, templates/, references/) is tracked in git
# and arrives with the repo clone above. Only the gitignored documents/ tree
# is synced separately via `make ec2-deploy` (rsync). Ensure the destination
# exists so the first deploy's rsync lands cleanly.
log "Creating skill documents directory…"
mkdir -p "$APP_DIR/skill/documents"

# ─── 6. Firewall (allow SSH + nginx; app port 3000 stays local) ─────────
log "Configuring UFW firewall…"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status

# ─── 7. Install systemd unit (but don't start it yet — needs .env + build) ─
log "Installing systemd unit…"
sudo tee /etc/systemd/system/ontario-land-use-chat.service >/dev/null \
  < deploy/systemd/ontario-land-use-chat.service
sudo systemctl daemon-reload

# ─── 8. Install nginx site ──────────────────────────────────────────────
log "Installing nginx site config…"
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo tee /etc/nginx/sites-available/ontario-land-use-chat.conf >/dev/null \
  < deploy/nginx/ontario-land-use-chat.conf
sudo ln -sf /etc/nginx/sites-available/ontario-land-use-chat.conf \
            /etc/nginx/sites-enabled/ontario-land-use-chat.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

log "===================================================="
log "EC2 setup complete. Next steps:"
log "  1. From local Mac:  make ec2-deploy        # syncs docs + deploys code"
log "  2. Create .env on EC2 at $APP_DIR/.env with:"
log "       DATABASE_URL, OLLAMA_API_KEY, SESSION_SECRET"
log "     (generate SESSION_SECRET with: openssl rand -base64 48)"
log "  3. On EC2:          cd $APP_DIR && bun run build"
log "  4. On EC2:          sudo systemctl enable --now $SERVICE"
log "  5. On EC2:          sudo certbot --nginx -d \$(hostname -f)"
log "===================================================="
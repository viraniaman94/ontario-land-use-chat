# Ontario Land Use Planning Chat — deployment helpers.
#
# Primary deployment target: EC2 (systemd + nginx + Let's Encrypt).
# See deploy/README.md → "EC2 Deployment" for the full guide.
#
# The Mac launchd + Cloudflare quick-tunnel targets below are retained
# only for local always-on dev on this Mac. Production runs on EC2.

SHELL := /bin/bash
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BUN := $(shell command -v bun || echo /Users/amanv/.bun/bin/bun)
CLOUDFLARED := $(shell command -v cloudflared || echo /opt/homebrew/bin/cloudflared)
# Use 3001 — port 3000 is occupied by the Hermes gateway on this Mac.
PORT ?= 3001
TUNNEL_NAME ?= ontario-land-use-chat
LAUNCH_AGENT_APP := ~/Library/LaunchAgents/com.user.ontario-land-use-chat.plist
LAUNCH_AGENT_TUN := ~/Library/LaunchAgents/com.user.cloudflare-tunnel-chat.plist

# --- EC2 deployment (primary production target) ---
# The app runs on an EC2 Ubuntu instance via systemd + nginx + Let's Encrypt.
# The SSH key (staff-gnarly-woof-ssh.pem) lives in the repo root (gitignored).
EC2_HOST ?= ec2-18-222-140-19.us-east-2.compute.amazonaws.com
EC2_USER ?= ubuntu
EC2_KEY  ?= staff-gnarly-woof-ssh.pem
EC2_APP_DIR ?= /opt/ontario-land-use-chat
EC2_PORT ?= 3000
SSH := ssh -i $(EC2_KEY) -o StrictHostKeyChecking=accept-new
SCP := scp -i $(EC2_KEY)
RSYNC := rsync -avz --progress -e "ssh -i $(EC2_KEY)"

.PHONY: install dev build start prod start-prod \
        tunnel-login tunnel-create tunnel-route-dns tunnel-run tunnel-list \
        launch-app-load launch-app-unload launch-tun-load launch-tun-unload \
        launch-load launch-unload \
        status logs logs-tun \
        convert-docs convert-docs-dir convert-docs-ocr convert-docs-dry \
        copy-converted-docs split-docs docs-pipeline

install:
	$(BUN) install

dev:
	PORT=$(PORT) $(BUN) dev

build:
	$(BUN) run build

# Production: build then start on PORT
prod: build
	PORT=$(PORT) $(BUN) run start

start:
	PORT=$(PORT) $(BUN) run start

start-prod: build start

# --- Cloudflare tunnel (legacy: Mac local dev only) ---
# These targets drive a cloudflared quick tunnel for local Mac exposure.
# Production runs on EC2 behind nginx + Let's Encrypt — see the ec2-* targets.

tunnel-login:
	$(CLOUDFLARED) tunnel login

# Usage: make tunnel-create TUNNEL_NAME=ontario-land-use-chat
tunnel-create:
	$(CLOUDFLARED) tunnel create $(TUNNEL_NAME)

# Usage: make tunnel-route-dns HOSTNAME=chat.yourdomain.com
tunnel-route-dns:
	$(CLOUDFLARED) tunnel route dns $(TUNNEL_NAME) $(HOSTNAME)

tunnel-run:
	$(CLOUDFLARED) tunnel run $(TUNNEL_NAME)

tunnel-list:
	$(CLOUDFLARED) tunnel list

# --- launchd persistence (legacy: Mac local dev only) ---

launch-app-load:
	launchctl unload $(LAUNCH_AGENT_APP) 2>/dev/null || true
	launchctl load $(LAUNCH_AGENT_APP)
	@echo "Loaded $(LAUNCH_AGENT_APP). App will auto-start on boot."

launch-app-unload:
	launchctl unload $(LAUNCH_AGENT_APP) 2>/dev/null || true
	@echo "Unloaded $(LAUNCH_AGENT_APP)."

launch-tun-load:
	launchctl unload $(LAUNCH_AGENT_TUN) 2>/dev/null || true
	launchctl load $(LAUNCH_AGENT_TUN)
	@echo "Loaded $(LAUNCH_AGENT_TUN). Tunnel will auto-start on boot."

launch-tun-unload:
	launchctl unload $(LAUNCH_AGENT_TUN) 2>/dev/null || true
	@echo "Unloaded $(LAUNCH_AGENT_TUN)."

launch-load: launch-app-load launch-tun-load
launch-unload: launch-app-unload launch-tun-unload

# --- observability ---

status:
	@launchctl list | grep -E "ontario-land-use-chat|cloudflare-tunnel-chat" || echo "no launch agents loaded"
	@echo "---"
	@curl -s -o /dev/null -w "local http://localhost:$(PORT): HTTP %{http_code}\n" http://localhost:$(PORT) || echo "local server not responding"

logs:
	@tail -f /Users/amanv/Projects/ontario-land-use-chat/.next/server.log /Users/amanv/Projects/ontario-land-use-chat/.next/server.err 2>/dev/null || \
	 echo "No server logs yet (server hasn't been started via launchd)."

logs-tun:
	@tail -f /tmp/cloudflared-chat.log /tmp/cloudflared-chat.err 2>/dev/null || \
	 echo "No tunnel logs yet (tunnel hasn't been started via launchd)."

# --- PDF -> Markdown conversion (Marker + Ollama Cloud / deepseek-v4-flash) ---
#
# Converts every PDF under the skill documents dir into LLM-friendly
# Markdown (tables as GFM), writing ./converted-docs/<relpath>.md plus a
# table-quality report at scripts/convert-report.{json,csv}.
#
# Reads OLLAMA_API_KEY from .env.local. Backend/model overridable via env:
#   OLLAMA_MODEL=qwen3-v2 make convert-docs
#   MARKER_CMD=marker_single make convert-docs-j2   # if marker installed on PATH
#
# Run `make convert-docs-dry` first to preview the file list.

PYTHON := $(shell command -v python3 || echo python3)
CONVERT_SCRIPT := $(APP_DIR)/scripts/convert_pdfs.py
SKILL_DIR := $(APP_DIR)/skill

convert-docs:
	$(PYTHON) $(CONVERT_SCRIPT) --input $(SKILL_DIR)/documents

# Resumable batch over a specific folder, 2 parallel jobs.
convert-docs-dir:
	$(PYTHON) $(CONVERT_SCRIPT) --input $(INPUT) --output $(OUTPUT) --jobs $(JOBS)

# Force re-convert scanned/image PDFs (adds --force_ocr).
convert-docs-ocr:
	$(PYTHON) $(CONVERT_SCRIPT) --force-ocr --force

convert-docs-dry:
	$(PYTHON) $(CONVERT_SCRIPT) --dry-run

# --- Copy converted Markdown to the skill documents directory ---
#
# After running `make convert-docs` (which writes to ./converted-docs/),
# copy the .md files into the vendored skill documents/ directory so the
# agent reads them directly. The destination is repo-relative (skill/documents/,
# gitignored) — NOT ~/.hermes.

copy-converted-docs:
	@for md in converted-docs/*/*.md; do \
	  rel=$${md#converted-docs/}; \
	  dest=$(SKILL_DIR)/documents/$$rel; \
	  mkdir -p $$(dirname $$dest); \
	  cp $$md $$dest; \
	  echo "Copied: $$rel"; \
	done

# --- Split markdown documents into navigable section files ---
#
# Splits each .md file in the skill documents directory into individual
# section files with per-document _index.md files and a top-level
# sections-index.md. Uses the `marko` markdown parser (installed via uv).
#
# Run after `make copy-converted-docs` to update the section navigation.

SPLIT_SCRIPT := $(APP_DIR)/scripts/split_markdown.py

split-docs:
	uv run --with marko $(SPLIT_SCRIPT) $(SKILL_DIR)/documents

# --- End-to-end docs pipeline ---
#
# Runs the full PDF -> Markdown -> section files -> EC2 sync pipeline in one
# command: convert PDFs, copy the converted .md into the skill documents dir,
# split them into navigable section files, then rsync to EC2 and restart the
# service to clear the in-memory doc cache. Prerequisites run left-to-right in
# a single-job make invocation, so the ordering is guaranteed.
#
# Tip: run `make convert-docs-dry` first to preview which PDFs will be
# converted. Skip the EC2 sync with `make docs-pipeline-no-sync` if you only
# need the local conversion + split (e.g. local dev without EC2 access).

docs-pipeline: convert-docs copy-converted-docs split-docs ec2-sync-docs
	@echo ">>> Full docs pipeline complete: PDFs converted, split, and synced to EC2."

docs-pipeline-no-sync: convert-docs copy-converted-docs split-docs
	@echo ">>> Local docs pipeline complete (no EC2 sync): PDFs converted and split."

# ===================================================================
# EC2 deployment (primary production)
# ===================================================================
# See deploy/README.md → "EC2 Deployment" for the full guide.
# The Cloudflare Workers + Mac/launchd paths below this remain as fallbacks.

.PHONY: ec2-ssh ec2-setup ec2-deploy ec2-logs ec2-status \
        ec2-restart ec2-stop ec2-sync-docs ec2-push-systemd ec2-push-nginx

# Interactive SSH shell on the EC2 instance.
ec2-ssh:
	$(SSH) $(EC2_USER)@$(EC2_HOST)

# One-time provisioning: install Node, Bun, nginx, ufw; clone repo; firewall.
# Safe to re-run (idempotent-ish). Run once when bringing up a new instance.
ec2-setup:
	@echo ">>> Provisioning EC2 instance $(EC2_HOST)…"
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'bash -s' < deploy/scripts/ec2-setup.sh
	@echo ">>> EC2 setup complete. Next: make ec2-deploy  (syncs docs + deploys code)"

# Deploy/update the app: rsync documents + templates → git pull → build → restart service.
# Pushes the latest deploy scripts first, syncs the gitignored skill/documents/
# and skill/templates/ trees (kept out of git), then runs ec2-deploy.sh on EC2.
ec2-deploy: ec2-push-systemd
	@echo ">>> Syncing skill documents to $(EC2_HOST):$(EC2_APP_DIR)/skill/documents/…"
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'mkdir -p $(EC2_APP_DIR)/skill/documents'
	$(RSYNC) --delete --delete-excluded \
	  --exclude='*.pdf' --exclude='*.html' --exclude='.DS_Store' \
	  $(SKILL_DIR)/documents/ \
	  $(EC2_USER)@$(EC2_HOST):$(EC2_APP_DIR)/skill/documents/
	@echo ">>> Syncing skill templates to $(EC2_HOST):$(EC2_APP_DIR)/skill/templates/…"
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'mkdir -p $(EC2_APP_DIR)/skill/templates'
	$(RSYNC) --delete --delete-excluded \
	  --exclude='.DS_Store' \
	  $(SKILL_DIR)/templates/ \
	  $(EC2_USER)@$(EC2_HOST):$(EC2_APP_DIR)/skill/templates/
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'cd $(EC2_APP_DIR) && bash deploy/scripts/ec2-deploy.sh'

# Install/refresh the systemd unit file on EC2 (does not start it).
ec2-push-systemd:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo mkdir -p /etc/systemd/system && sudo tee /etc/systemd/system/ontario-land-use-chat.service >/dev/null' \
		< deploy/systemd/ontario-land-use-chat.service
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo systemctl daemon-reload'
	@echo "systemd unit installed. Enable with: sudo systemctl enable --now ontario-land-use-chat"

# Install/refresh the nginx site config on EC2.
ec2-push-nginx:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled && sudo tee /etc/nginx/sites-available/ontario-land-use-chat.conf >/dev/null' \
		< deploy/nginx/ontario-land-use-chat.conf
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo ln -sf /etc/nginx/sites-available/ontario-land-use-chat.conf /etc/nginx/sites-enabled/ontario-land-use-chat.conf && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx'
	@echo "nginx config installed + reloaded. Run certbot next: sudo certbot --nginx -d $(EC2_HOST)"

# Sync the gitignored skill/documents/ tree from the local repo to EC2, then
# restart the service to clear the in-memory document cache (no TTL). The
# tracked skill scaffolding (SKILL.md) travels via git in `make
# ec2-deploy`; templates/ is gitignored too and synced via `make
# ec2-sync-templates` (or `make ec2-deploy`). This target is for document-only
# updates.
ec2-sync-docs:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'mkdir -p $(EC2_APP_DIR)/skill/documents'
	$(RSYNC) --delete --delete-excluded \
	  --exclude='*.pdf' --exclude='*.html' --exclude='.DS_Store' \
	  $(SKILL_DIR)/documents/ \
	  $(EC2_USER)@$(EC2_HOST):$(EC2_APP_DIR)/skill/documents/
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo systemctl restart ontario-land-use-chat'
	@echo "Docs synced + service restarted (cache cleared)."

# Sync the gitignored skill/templates/ tree from the local repo to EC2, then
# restart the service. Templates are read from disk on each request (no cache),
# so the restart is just to be consistent with ec2-sync-docs. Template-only
# update; use `make ec2-deploy` for docs + templates + code together.
ec2-sync-templates:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'mkdir -p $(EC2_APP_DIR)/skill/templates'
	$(RSYNC) --delete --delete-excluded \
	  --exclude='.DS_Store' \
	  $(SKILL_DIR)/templates/ \
	  $(EC2_USER)@$(EC2_HOST):$(EC2_APP_DIR)/skill/templates/
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo systemctl restart ontario-land-use-chat'
	@echo "Templates synced + service restarted."

# Tail the app logs (journald) on EC2.
ec2-logs:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'journalctl -u ontario-land-use-chat --no-pager -n 100 -f'

# Show service status + a local health check from EC2.
ec2-status:
	$(SSH) $(EC2_USER)@$(EC2_HOST) \
	  'systemctl status ontario-land-use-chat --no-pager 2>/dev/null | head -15; echo "---"; curl -s -o /dev/null -w "local http://localhost:$(EC2_PORT)/login: HTTP %{http_code}\n" http://localhost:$(EC2_PORT)/login || echo "local server not responding"'

# Restart the app service on EC2 (also clears the in-memory doc cache).
ec2-restart:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo systemctl restart ontario-land-use-chat'

# Stop the app service on EC2.
ec2-stop:
	$(SSH) $(EC2_USER)@$(EC2_HOST) 'sudo systemctl stop ontario-land-use-chat'
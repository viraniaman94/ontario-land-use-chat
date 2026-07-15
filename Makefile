# Ontario Land Use Planning Chat — deployment helpers.
#
# Most of these wrap the manual steps in Task 9 of the implementation
# plan. The interactive Cloudflare steps (login, tunnel create, DNS route)
# must be run by hand once; everything after that is automatable.

SHELL := /bin/bash
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BUN := $(shell command -v bun || echo /Users/amanv/.bun/bin/bun)
CLOUDFLARED := $(shell command -v cloudflared || echo /opt/homebrew/bin/cloudflared)
# Use 3001 — port 3000 is occupied by the Hermes gateway on this Mac.
PORT ?= 3001
TUNNEL_NAME ?= ontario-land-use-chat
LAUNCH_AGENT_APP := ~/Library/LaunchAgents/com.user.ontario-land-use-chat.plist
LAUNCH_AGENT_TUN := ~/Library/LaunchAgents/com.user.cloudflare-tunnel-chat.plist

.PHONY: install dev build start prod start-prod \
        tunnel-login tunnel-create tunnel-route-dns tunnel-run tunnel-list \
        launch-app-load launch-app-unload launch-tun-load launch-tun-unload \
        launch-load launch-unload \
        status logs logs-tun \
        convert-docs convert-docs-dir convert-docs-ocr convert-docs-dry \
        copy-converted-docs split-docs

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

# --- Cloudflare tunnel one-time setup (manual / interactive) ---

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

# --- launchd persistence ---

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

convert-docs:
	$(PYTHON) $(CONVERT_SCRIPT)

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
# copy the .md files into the skill's documents/ directory so the agent
# reads them directly.

copy-converted-docs:
	@for md in converted-docs/*/*.md; do \
	  rel=$${md#converted-docs/}; \
	  dest=$$HOME/.hermes/skills/ontario-land-use-feasibility/documents/$$rel; \
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
	uv run --with marko $(SPLIT_SCRIPT)
#!/bin/bash
# start-tunnel.sh
# ---------------------------------------------------------------------------
# Launch a Cloudflare quick tunnel pointing at the local app and persist the
# assigned public URL to a known file so other tools/scripts can discover it.
#
# The app is expected to be running on http://localhost:3001, managed by the
# com.user.ontario-land-use-chat launchd agent.
#
# Quick tunnels issue a RANDOM trycloudflare.com subdomain on every start, so
# the URL file is rewritten whenever a new URL is emitted. This is fine for
# single-user dev/testing. For a stable hostname, set up a named tunnel via
# `make tunnel-login` (requires a Cloudflare account) — see README.
#
#   URL file:   <repo-root>/.tunnel-url.txt  (gitignored)
#   Tunnel log: <repo-root>/.tunnel-url.log  (gitignored)
#
# Robustness: cloudflared is started in the background and this script `wait`s
# on it so the script stays alive as the launchd-tracked process. A trap on
# EXIT/INT/TERM kills cloudflared so launchd restarts never leave orphaned
# cloudflared processes holding stale tunnels.
# ---------------------------------------------------------------------------

CLOUDFLARED="/opt/homebrew/bin/cloudflared"
APP_URL="http://localhost:3001"

# Resolve the repo root from this script's location
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
repo_dir="$(cd "$deploy_dir/../.." && pwd)"

URL_FILE="$repo_dir/.tunnel-url.txt"
LOG_FILE="$repo_dir/.tunnel-url.log"
mkdir -p "$(dirname "$URL_FILE")"
# Both files are gitignored (see .gitignore: .tunnel-url.*).

# Clear stale URL and truncate log for this run.
: > "$URL_FILE"
: > "$LOG_FILE"
echo "[$(date -Iseconds)] starting quick tunnel -> $APP_URL" >> "$LOG_FILE"

# Start cloudflared in the background, output appended to the log file.
"$CLOUDFLARED" tunnel --url "$APP_URL" >> "$LOG_FILE" 2>&1 &
CF_PID=$!

# Kill cloudflared when this script exits so launchd restarts cleanly.
cleanup() {
  kill "$CF_PID" 2>/dev/null
  wait "$CF_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Poll the log for up to 30s for the trycloudflare URL, then persist it.
# cloudflared emits the announcement line within a few seconds of startup.
for i in $(seq 1 30); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -n1)"
  if [ -n "$url" ]; then
    printf '%s\n' "$url" > "$URL_FILE"
    echo "[$(date -Iseconds)] tunnel URL written to $URL_FILE" >> "$LOG_FILE"
    break
  fi
  sleep 1
done

# Block until cloudflared exits; the trap cleanup runs afterward, then
# launchd's KeepAlive restarts this script.
wait "$CF_PID" 2>/dev/null

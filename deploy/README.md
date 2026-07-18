# Deployment

The app has two deployment paths. **EC2 is the primary production target.**

| Path | Status | Runtime | TLS | Docs |
|------|--------|---------|-----|------|
| **EC2** (systemd + nginx) | ✅ Primary | Node.js (`react-router-serve`) | Let's Encrypt (certbot) | Filesystem |
| Mac launchd + quick tunnel | Legacy (local dev) | Node.js | Cloudflare tunnel | Filesystem |

## EC2 Deployment (primary)

Runs on an EC2 Ubuntu instance behind nginx with Let's Encrypt TLS.
Documents are read from the repo-vendored `skill/documents/` tree
(gitignored, synced via `make ec2-deploy` / `make ec2-sync-docs`).

### Prerequisites

- The SSH key `staff-gnarly-woof-ssh.pem` in the repo root (gitignored).
- The EC2 security group allows inbound **22** (SSH), **80** + **443** (nginx).
  The app port (3000) is **not** exposed publicly — nginx proxies to it.
- Local skill documents at `skill/documents/` (gitignored; synced via rsync)
  (produced by `make convert-docs` → `make copy-converted-docs` →
  `make split-docs`).

### One-time setup (from local Mac)

```bash
make ec2-setup       # installs Node 22, Bun, nginx, ufw; clones repo; firewall
make ec2-sync-docs   # rsync documents/ + SKILL.md + templates/ to EC2
```

### Configure secrets + build (on EC2)

```bash
make ec2-ssh         # or: ssh -i staff-gnarly-woof-ssh.pem ubuntu@<host>
```

On EC2:

```bash
cd /opt/ontario-land-use-chat

# 1. Create .env (chmod 600)
openssl rand -base64 48   # → SESSION_SECRET
cat > .env <<EOF
DATABASE_URL=postgresql://...
OLLAMA_API_KEY=...
SESSION_SECRET=<paste above>
NODE_ENV=production
PORT=3000
EOF
chmod 600 .env

# 2. Build + start
bun run build
sudo systemctl enable --now ontario-land-use-chat
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login   # → 200

# 3. TLS via Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ontariochat.duckdns.org
```

### Day-to-day deploys (from local Mac)

```bash
make ec2-deploy      # git pull → bun install → build → systemctl restart
make ec2-status      # service status + health check
make ec2-logs        # tail journald
make ec2-restart     # restart (also clears the in-memory doc cache)
```

### Updating planning documents

```bash
# Locally:
make convert-docs && make copy-converted-docs && make split-docs
# Then push to EC2:
make ec2-sync-docs   # rsync + restart (restart clears the doc cache)
```

> The document service caches documents in-memory with no TTL. A service
> restart is required after updating docs — `make ec2-sync-docs` does this
> automatically.

### Files

| File | Purpose |
|------|---------|
| `systemd/ontario-land-use-chat.service` | systemd unit (replaces launchd plist) |
| `nginx/ontario-land-use-chat.conf` | nginx reverse proxy (SSE-aware, 300s timeout) |
| `scripts/ec2-setup.sh` | one-time provisioning script |
| `scripts/ec2-deploy.sh` | deploy/update script |

### Why `node` not `bun run start` in the systemd unit

`bun run start` spawns a child server then the bun parent exits (exit
code 1), which confuses process supervisors. The systemd unit invokes
`node node_modules/.bin/react-router-serve` directly so the process
stays in the foreground and systemd can track its PID and restart on
crash. (Same workaround the Mac launchd plist uses.)

### SSE through nginx

`/api/chat` streams the LLM response as SSE. The nginx config sets
`proxy_buffering off`, `proxy_cache off`, and a 300s read/send timeout so
tokens flush to the browser immediately and long responses don't time
out.

### TLS and the `secure` cookie flag

`session.ts` sets the session cookie `Secure` flag when
`NODE_ENV=production`. Without TLS the browser refuses to set the cookie
and auth silently fails. **TLS (certbot) is mandatory for production.**

---

## Mac launchd (legacy, local dev only)

Kept for local always-on dev on the Mac. Not used for production.

- `launchd/com.user.ontario-land-use-chat.plist` — `react-router-serve`
  on port 3001 (avoids the Hermes gateway on 3000).
- `launchd/com.user.cloudflare-tunnel-chat.plist` — cloudflared quick tunnel.

```bash
cp deploy/launchd/*.plist ~/Library/LaunchAgents/
make launch-load    # load both agents
make launch-unload  # stop both
```

> ⚠️ Quick tunnels are dev-only (random `trycloudflare.com` URL, 200
> concurrent-request cap, no official SSE support). Use the EC2 path for
> production.
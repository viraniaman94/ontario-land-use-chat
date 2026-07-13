# Deployment artifacts

These scripts deploy the app natively on this Mac (M2 Max, always-on) and
expose it publicly through a Cloudflare Tunnel.

## Files

- `../Makefile` — `make` targets wrapping the manual steps below.
- `launchd/com.user.ontario-land-use-chat.plist` — keeps `bun run start`
  alive on port 3001 across reboots. Install to `~/Library/LaunchAgents/`.
- `launchd/com.user.cloudflare-tunnel-chat.plist` — keeps `cloudflared
  tunnel run` alive across reboots. Install to `~/Library/LaunchAgents/`.

The API key is **not** stored in the plist — Next.js reads `OLLAMA_API_KEY`
from `.env.local` at runtime, so the plist stays secret-free.

> ⚠️ **Quick tunnels are dev-only.** `cloudflared tunnel --url
> http://localhost:3001` gives a random `trycloudflare.com` subdomain with
> no Cloudflare account. Per Cloudflare's docs they have a **200
> concurrent-request limit, no uptime guarantee, and officially do not
> support Server-Sent Events (SSE)**. Our `/api/chat` streams the LLM
> response as SSE (`createUIMessageStreamResponse`). In practice we observed
> SSE streaming working fine through a quick tunnel for single-user dev
> testing (reasoning + text deltas + `[DONE]` all arrived intact) — so it's
> fine for trying the app, but don't rely on it under load. For shared or
> long-lived use, use the **named** tunnel below (SSE fully supported, no
> concurrent request cap).
>
> To test the full app without Cloudflare, just hit the Mac directly:
> `http://localhost:3001` (same machine) or
> `http://192.168.2.15:3001` (any device on your LAN). No tunnel needed.

## One-time Cloudflare setup (interactive, run by hand)

```bash
make tunnel-login                                    # browser auth, writes ~/.cloudflared/cert.pem
make tunnel-create                                   # writes ~/.cloudflared/<UUID>.json
make tunnel-route-dns HOSTNAME=chat.yourdomain.com   # creates the DNS CNAME
```

Then create `~/.cloudflared/config.yml` (replace UUID + hostname):

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/amanv/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: chat.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

## Run + persist

```bash
# Install the plists into ~/Library/LaunchAgents/ (cp from deploy/launchd/)
cp deploy/launchd/*.plist ~/Library/LaunchAgents/

# Load both agents (app server + tunnel)
make launch-load

# Verify
make status
curl -s https://chat.yourdomain.com | head -20
```

`make launch-unload` stops both. Logs land in `.next/server.log` and
`/tmp/cloudflared-chat.log` (`make logs`, `make logs-tun`).

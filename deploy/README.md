# Deployment artifacts

These scripts deploy the app natively on this Mac (M2 Max, always-on) and
expose it publicly through a Cloudflare Tunnel.

## Files

- `../Makefile` — `make` targets wrapping the manual steps below.
- `launchd/com.user.ontario-land-use-chat.plist` — keeps `bun run start`
  alive on port 3001 across reboots. Install to `~/Library/LaunchAgents/`.
- `launchd/com.user.cloudflare-tunnel-chat.plist` — keeps `cloudflared
  tunnel run` alive across reboots. Install to `~/Library/LaunchAgents/`.

The API key is **not** stored in the plist — Next.js reads `OPENCODE_GO_API_KEY`
from `.env.local` at runtime, so the plist stays secret-free.

> ⚠️ **Quick tunnels won't work for chat.** `cloudflared tunnel --url
> http://localhost:3001` gives you a `trycloudflare.com` subdomain with no
> account, but per Cloudflare's docs quick tunnels do **not support
> Server-Sent Events (SSE)**. Our `/api/chat` route streams the LLM
> response as SSE (`createUIMessageStreamResponse`), so through a quick
> tunnel the page loads but the chat hangs and never streams. You need
> the **named** tunnel below (which supports SSE) for chat to work over
> Cloudflare.
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

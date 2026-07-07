# Ontario Land Use Planning Feasibility Agent

A chat application that packages the
[`ontario-land-use-feasibility`](https://github.com/) Hermes skill into a
deployable web UI. Ask it about a proposed development — site location,
municipality, proposed land use, scale — and the agent assesses feasibility
against provincial policy, official plans, and zoning by-laws, reading 41
planning documents on demand and returning cited findings with a verdict
(GO / CONDITIONAL GO / CAUTION / NO-GO).

## How it works

```
User message
   →  POST /api/chat  (streaming, SSE)
   →  system prompt built from SKILL.md + document index + report template
   →  GLM-5.2 (OpenCode Go, OpenAI-compatible) streams a response
   →  when the model needs a document, it calls a server-side tool:
        listDocuments()      — returns the document index
        searchDocuments(q)   — grep the index for matching entries
        readDocument(path)   — reads a PDF/HTML/MD file from disk
   →  tokens stream back to the browser and render as markdown
```

Planning documents are **read from disk** — they are not bundled, uploaded,
or sent to a vector store. The app expects the Hermes skill to be installed
at `~/.hermes/skills/ontario-land-use-feasibility/documents/` (269 MB across
41 files).

## Tech stack

- **Next.js 16** (App Router, route handlers, Turbopack)
- **React 19**
- **shadcn/ui v4** on **Tailwind CSS v4** (sidebar, sheet, button, textarea,
  card, scroll-area, separator, avatar, skeleton, sonner, tooltip)
- **AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`)
- **pdf-parse** for PDF text extraction
- **react-markdown** + **remark-gfm** for rendering assistant messages
  (tables, headings, lists)
- **TypeScript**, **Bun**

## LLM provider

The agent talks to OpenCode Go's OpenAI-compatible endpoint:

| Setting        | Value                                   |
|----------------|-----------------------------------------|
| Base URL       | `https://opencode.ai/zen/go/v1`         |
| Endpoint       | `POST /chat/completions`                |
| Model          | `glm-5.2`                               |
| Env var        | `OPENCODE_GO_API_KEY`                   |

Override the base URL with `OPENCODE_GO_BASE_URL` if you have a custom
upstream. See `lib/ai-provider.ts`.

## Prerequisites

- **Bun 1.3+** — `brew install bun`
- **Node 18+** (for Next.js tooling)
- A valid `OPENCODE_GO_API_KEY`
- The Hermes land-use skill installed at
  `~/.hermes/skills/ontario-land-use-feasibility/` (with `SKILL.md`,
  `documents/`, `templates/feasibility-report.md`)

## Install

```bash
cd ontario-land-use-chat
bun install
cp .env.example .env.local
# edit .env.local and paste your OPENCODE_GO_API_KEY
```

## Run locally

```bash
bun dev
```

Open <http://localhost:3000>. On this Mac, port 3000 is occupied by the Hermes
gateway, so the app runs on **3001** by default — the included `Makefile` and
launchd plist both use `PORT=3001`. To pick another port:

```bash
PORT=3001 bun dev   # or: bun dev -- -p 3001
```

## Production build & start

```bash
bun run build
bun run start
# defaults to 3000; on this Mac use:
#   PORT=3001 bun run start
```

## Configuration

| Variable                 | Required | Default                              | Notes                          |
|--------------------------|----------|--------------------------------------|--------------------------------|
| `OPENCODE_GO_API_KEY`    | yes      | —                                    | API key for OpenCode Go        |
| `OPENCODE_GO_BASE_URL`   | no       | `https://opencode.ai/zen/go/v1`      | Override upstream base URL     |
| `PORT`                   | no       | `3000`                               | Next.js listen port            |

## How documents work

The agent never uploads PDFs to the LLM. Instead:

1. The system prompt embeds the full **document index**
   (`documents/document-index.md`) so the model knows what exists and the
   relative paths to use.
2. The model calls `readDocument(relPath)` to pull a specific file.
   The route handler resolves the path under
   `~/.hermes/skills/ontario-land-use-feasibility/documents/` (with path
   traversal protection), extracts text (PDF via `pdf-parse`, HTML tags
   stripped, markdown read directly), truncates to 50,000 chars, and
   returns it as the tool result.
3. Read documents are cached in-memory for the server's lifetime.

## Conversation history

Conversations are stored in **`localStorage`** (no backend persistence in
v1). The left sidebar lists past chats titled by the first user message.
Use **New assessment** to start a fresh one; the trash icon deletes a
conversation. Refreshing the page persists everything.

## Architecture

```
app/
  layout.tsx                  Root layout, fonts, TooltipProvider
  page.tsx                    Client page: SidebarProvider + Chat
  api/chat/route.ts           Streaming chat route (nodejs runtime)
components/
  chat/                       chat-header, chat-messages, chat-input,
                              chat-message, chat-sidebar, chat
  ui/                         shadcn/ui primitives
hooks/
  use-conversations.ts        localStorage conversation store
  use-mobile.ts              Breakpoint hook (shadcn sidebar)
lib/
  ai-provider.ts              OpenCode Go provider config
  agent/
    document-service.ts       Read documents from skill dir (path-safe)
    system-prompt.ts         Build system prompt from SKILL.md + index
    tools.ts                 listDocuments / searchDocuments / readDocument
  utils.ts                    cn() helper
```

## Deployment

### On this Mac via Cloudflare Tunnel (recommended)

The app reads documents from the local filesystem, so it must run on a
machine that has the skill installed. This MacBook (M2 Max, always-on) is
ideal. Run the production server natively and expose it through a
Cloudflare Tunnel for HTTPS without exposing the Mac's IP.

> ⚠️ **Quick tunnels (`cloudflared tunnel --url http://localhost:3001`)
> are dev-only** — they give a random `trycloudflare.com` subdomain with no
> Cloudflare account, but per Cloudflare's docs they carry a **200
> concurrent-request limit and no uptime guarantee**. Their docs also say
> quick tunnels "do not support Server-Sent Events (SSE)." In practice we
> observed SSE streaming through a quick tunnel working fine for single-user
> dev/testing (reasoning + text deltas + `[DONE]` all arrived intact), but
> don't rely on it under load — for any shared or long-lived use, set up the
> **named** tunnel below, which fully supports SSE and has no concurrent
> request cap. To try the app without Cloudflare at all, just open
> `http://localhost:3001` (or `http://192.168.2.15:3001` from another device
> on your LAN).

```bash
# 1. Build & start the prod server
bun run build
PORT=3001 bun run start        # http://localhost:3001 (3000 is the Hermes gateway)

# 1b. (optional) quick dev tunnel — random trycloudflare.com URL, no account:
#     cloudflared tunnel --url http://localhost:3001

# 2. Install & authenticate cloudflared
brew install cloudflared
cloudflared tunnel login     # pick a hostname on your Cloudflare zone

# 3. Create the tunnel and route DNS
cloudflared tunnel create ontario-land-use-chat
cloudflared tunnel route dns ontario-land-use-chat chat.yourdomain.com

# 4. Configure ~/.cloudflared/config.yml
#    tunnel: <TUNNEL_UUID>
#    credentials-file: /Users/amanv/.cloudflared/<TUNNEL_UUID>.json
#    ingress:
#      - hostname: chat.yourdomain.com
#        service: http://localhost:3001
#      - service: http_status:404

# 5. Run it
cloudflared tunnel run ontario-land-use-chat
```

See `Task 9` in the plan for `launchd` plists that keep both the Next.js
server and the tunnel alive across reboots.

### Other platforms

Any host with filesystem access to the skill's `documents/` directory works
(a VPS, a Docker container with a mounted volume, etc.). Pure serverless
platforms (Vercel functions, Cloudflare Workers) won't work because the
route handler reads large PDFs from the local disk.

## Limitations & known gaps

- **PDF extraction quality** — `pdf-parse` may produce messy output for
  complex zoning by-law tables. The plan notes `marker-pdf` / `mupdf` as a
  fallback if needed.
- **Token budget** — documents are truncated to 50K chars per read. GLM-5.2
  has a large context window, but reading many full PDFs in one assessment
  can get expensive. The system prompt tells the model to read selectively.
- **No pagination** — the v1 `readDocument` tool returns a truncated prefix.
  An optional `offset`/`limit` could be added for paging long PDFs.
- **No auth** — v1 has no user authentication; anyone who can reach the
  tunnel can use the agent and consume API credits. Add Cloudflare Access
  (`cloudflared access`) in front of the tunnel for protection.
- **Preliminary assessment only** — findings must be reviewed by a
  registered professional planner (RPP) before relying on them.
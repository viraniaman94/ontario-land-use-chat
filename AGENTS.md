# Ontario Land Use Planning Chat

> **Maintenance directive:** Keep this file accurate. When you add/remove/rename
> a file, change a dependency, update a script, or alter the architecture —
> update the relevant section in the same change. Prune stale notes. Keep under
> 16 KB / 300 lines; consolidate or link to a sub-doc if it grows. Don't let
> it rot.

A React Router v8 chat app wrapping an AI agent that assesses whether proposed
development projects are feasible under Ontario's land use planning framework
(provincial policy, provincial plans, municipal official plans, zoning
by-laws). Scope: 41 planning documents within ~150 km of Peterborough.

> **Before relying on any AI SDK / React Router API detail, verify against the
> installed versions** — these are newer than most training cutoffs. Use
> Context7 for AI SDK APIs, and inspect `@react-router/*` package types or
> docs for React Router v8 specifics.

## Task Tracking (Kanban Board)

Work is tracked on a local SQLite board at `tasks/kanban.db` (schema:
`scripts/kanban-schema.sql`). All interaction goes through the **`scripts/kanban`**
CLI wrapper — never hand-write `sqlite3` (the CLI validates inputs and writes the
`task_activity` audit log). Full command reference: `.agents/skills/kanban/SKILL.md`.

When doing tasks, the board is the source of truth for work state:
- **Start of session:** `read` the skill, then `scripts/kanban list`.
- **Pick up work:** `scripts/kanban start <id>` (→ `in_progress`).
- **Break down:** `scripts/kanban add <id> "<title>" [opts]` (kebab-case ids;
  `--parent=<id>` for subtasks).
- **Finish:** `scripts/kanban done <id>`; `scripts/kanban note <id> "<text>"`.

Prefer the board over the in-context `manage_todo_list` for anything that should
survive across sessions. `tasks/kanban.db` is tracked; `*-wal/-shm/-journal` are
gitignored. No external deps (system `sqlite3`).

## Tech Stack

- **React Router v8** (framework mode, SSR, flat file routing, middleware) + **React 19**
- **Vite 7** (Environment API); **Bun** as package manager / runtime
- **AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`) — UI uses
  `UIMessage[]` with a `parts` array (NOT a `content` string)
- **OpenAI-compatible LLM provider** — Ollama Cloud, model `deepseek-v4-pro`
  (`OLLAMA_API_KEY`, base URL `https://ollama.com/v1`)
- **Neon Postgres** (`@neondatabase/serverless` — HTTP-based, serverless-friendly)
  for persistent conversation and message storage
- **EC2 Ubuntu** (systemd + nginx + Let's Encrypt) for production.
  Documents are read from the filesystem; no R2/Workers involved.
- **Tailwind v4** + **shadcn/ui** (`base-nova` style) on **`@base-ui/react`**
  primitives (NOT Radix); **react-markdown** + **remark-gfm** +
  **rehype-highlight** for rendering assistant messages

## Project Layout

```
app/
  root.tsx                       Root layout (HTML shell, TooltipProvider)
  routes.ts                      Flat file route config (flatRoutes from @react-router/fs-routes)
  entry.server.tsx               Custom SSR entry (Web Streams, Node 18+ compatible)
  globals.css                    Tailwind v4 + custom pi-* theme classes
  routes/
    _auth.tsx                    Pathless layout: authMiddleware guard + DB schema init
    _auth._index.tsx             Home page: sidebar + chat, conversation CRUD (optimistic UI)
    login.tsx / logout.tsx       Password login page / logout resource route (GET + POST)
    api.chat.ts                  Streaming chat endpoint (POST, SSE)
    api.conversations.ts*        GET/POST/PUT/DELETE conversations + messages
  auth/
    session.ts                   Cookie session storage, password check, auth helpers
    middleware.ts                v8 middleware: authMiddleware, apiAuthMiddleware
  db/
    client.ts                    Neon client, conversation/message CRUD, ensureSchema()
    schema.sql                   Database schema (conversations + messages, indexes)
  components/                    chat/ (see below) + ui/ (vendored shadcn/ui, base-ui)
  hooks/
    use-conversations.ts         ConversationMeta type only (CRUD moved to route layer)
    use-stream-status.ts         Chat stream status + stall timeout
    use-mobile.ts                Viewport breakpoint hook (768px)
  lib/
    ai-provider.ts               Ollama Cloud provider + MODEL_ID ("deepseek-v4-pro")
    agent/
      document-service.ts        Document read/list/search (filesystem), cache
      tools.ts                   AI SDK tool defs: readDocument, listDocuments, searchDocuments
      system-prompt.ts           Builds system prompt (SKILL.md + sections index + template + 10 rules)
    utils.ts                     cn() helper
scripts/
  convert_pdfs.py                Marker + LLM PDF→Markdown converter; writes ./converted-docs/*.md
  split_markdown.py              Splits .md docs into section files with _index.md + sections-index.md
  setup-db.mjs                   Creates Neon Postgres schema from app/db/schema.sql
  kanban / kanban-schema.sql     SQLite kanban board CLI + schema (tasks + task_activity + board_meta)
  kanban-init.sh                 (Re)create tasks/kanban.db from kanban-schema.sql
tasks/kanban.db                  Local SQLite kanban board (tracked); sidecars gitignored
.agents/skills/kanban/SKILL.md   Kanban agent skill — command reference for scripts/kanban
deploy/
  systemd/ontario-land-use-chat.service  systemd unit for the Node.js app (EC2 production)
  nginx/ontario-land-use-chat.conf       nginx reverse proxy (SSE-aware, TLS via certbot)
  scripts/ec2-setup.sh                    One-time EC2 provisioning (Node, Bun, nginx, ufw, clone)
  scripts/ec2-deploy.sh                   EC2 deploy/update (git pull → build → restart)
  launchd/*.plist                         Legacy: Mac launchd agents (local dev only)
Makefile                         install/dev/build/prod, tunnel, launchd, ec2-*, convert-docs, split-docs
vite.config.ts                   Vite config (loadEnv env injection)
react-router.config.ts           React Router config (ssr: true)
tsconfig.json                    TS config (strict, ~/* and @/* → ./app/*)
converted-docs/                  Marker-converted Markdown docs (gitignored)
```

### Chat Component Tree

`Chat` (loads conversation from DB, persist guard) → `ChatInner` (memoized,
owns `useChat`) → `ChatHeader`, `ChatMessages` (auto-scroll, empty state,
"Analyzing…"; `AssistantMessage` routes parts: `MarkdownContent` text,
`ThinkingBlock` reasoning, `ToolCallBlock` tool-* state-tinted, `step-start`
separators; `ChatMessage` for user bubbles), `ChatInput` (textarea +
send/stop), `StreamStatusBar` (always-on stream-state line: dot + label +
elapsed timer, rendered above the input).

## How the Agent Works

`lib/agent/system-prompt.ts` assembles: `SKILL.md` (10-step assessment
procedure), `templates/feasibility-report.md`, and the top-level
`sections-index.md`, plus 10 critical rules (never fabricate, always cite, flag
missing docs, check Bill 17 setbacks, use GO/CONDITIONAL GO/CAUTION/NO-GO
verdicts).

The agent has 3 tools (defined in `lib/agent/tools.ts`, backed by
`document-service.ts`):

- **`readDocument(path)`** — reads any `.md`/section file from the skill docs
  dir (truncated 50K chars, cached in-memory).
- **`listDocuments()`** — returns top-level `sections-index.md` (falls back to
  `document-index.md`).
- **`searchDocuments(query)`** — case-insensitive AND-search across all
  section indexes (top-level + per-doc `_index.md`). Results capped at 200.

The chat route (`api.chat.ts`) wraps `streamText({ model, system, messages,
tools, stopWhen: isStepCount(20), temperature: 0.2 })` and returns a UI message
stream (SSE) via `createUIMessageStreamResponse`.

### Document Navigation

All planning documents are stored as `.md` files. Large documents (200 KB –
900 KB) are split into individual section files by `scripts/split_markdown.py`,
creating a navigable directory structure:

```
documents/
  sections-index.md                  # top-level index: every doc + section count + paths
  provincial/pps-2024/_index.md       # per-doc index: sections w/ 1-line summaries
  provincial/pps-2024/06-22-housing.md # a specific split section file
  upper-tier/... single-tier/... zoning/...
```

The agent navigates without loading entire large documents:
`listDocuments()` → `sections-index.md`, then `readDocument("<doc>/_index.md")`
→ `readDocument("<doc>/<section>.md")`.

### Document Storage

Documents are read from the filesystem at `LAND_USE_DOCS_DIR` or the default
`~/.hermes/skills/ontario-land-use-feasibility/documents`. `resolveSafe()`
guards path traversal; Node built-ins (`fs`,`path`,`os`) loaded via lazy
`eval("require")` to avoid bundler issues. On EC2, docs are synced from a
local Mac via `make ec2-sync-docs` (rsync).

In-memory caches (`docCache`, `searchIndexCache`) persist for the process
lifetime with no TTL — restart the service to pick up doc updates.
### PDF → Markdown → Split Section Files Pipeline

1. **Convert:** `make convert-docs` → `scripts/convert_pdfs.py` (Marker + LLM,
   `deepseek-v4-flash`) → `./converted-docs/*.md`
2. **Copy:** `make copy-converted-docs` → skill `documents/` dir
3. **Split:** `make split-docs` → `split_markdown.py` → section files +
   `_index.md` per doc + top-level `sections-index.md`
4. **Sync to EC2:** `make ec2-sync-docs` → rsync the skill dir to the EC2
   instance + restart the service (clears the in-memory doc cache).

## Authentication

Single hardcoded password protects the app — no user accounts, no registration.

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_PASSWORD` | `ontario2025` | Override via env var |
| `SESSION_SECRET` | (dev default) | 32+ char random string for prod |

Auth enforced via React Router v8 middleware:
- **`authMiddleware`** (browser routes) — redirect to `/login` if unauthenticated;
  applied to `_auth.tsx` pathless layout.
- **`apiAuthMiddleware`** (API routes) — 401 JSON if unauthenticated; applied to
  all `api.*` routes.

Session is a signed cookie (`createCookieSessionStorage`), `httpOnly: true`,
`sameSite: "lax"`, `secure` in production.

## Database (Neon Postgres)

| Table | Columns |
|-------|---------|
| `conversations` | id (PK), title, created_at, updated_at |
| `messages` | id (PK), conversation_id (FK→conversations ON DELETE CASCADE), role, parts (JSONB), created_at |

- Schema auto-created on first server load via `ensureSchema()` (idempotent
  `IF NOT EXISTS`, module-level flag).
- Messages stored as JSONB to preserve full `UIMessage` structure (text,
  reasoning, tool-call parts).
- `replaceMessages()` does delete-then-insert (no transaction — partial
  failure risk). `listConversations()` returns all rows (no pagination).

## Environment

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | yes | — | Neon Postgres connection string |
| `OLLAMA_API_KEY` | yes | — | Ollama Cloud API key |
| `OLLAMA_BASE_URL` | no | `https://ollama.com/v1` | Override LLM endpoint |
| `APP_PASSWORD` | no | `ontario2025` | Single shared access password |
| `SESSION_SECRET` | no | (dev default) | Cookie signing secret (32+ chars) |
| `LAND_USE_DOCS_DIR` | no | skill `documents/` | Override filesystem docs directory |

On EC2, all env vars live in `/opt/ontario-land-use-chat/.env` (loaded by the
systemd unit's `EnvironmentFile` and by `vite.config.ts` `loadEnv` at build time).

## Commands

```bash
make install              # bun install
make dev                  # bun dev (local Node.js, filesystem docs)
make prod                 # build + start
make convert-docs         # run scripts/convert_pdfs.py (PDF→MD)
make convert-docs-dry     # preview the file list
make copy-converted-docs  # copy converted-docs/*.md to skill documents dir
make split-docs           # split .md docs into section files + indexes
bun run db:setup          # create Neon Postgres schema
bun run typecheck         # react-router typegen && tsc --noEmit
./scripts/kanban-init.sh  # (re)create the local SQLite kanban board (tasks/kanban.db)
bun run setup:hooks       # (re)install git hooks (pre-commit size guard + pre-push EC2 deploy)

make ec2-setup       # one-time: install Node, Bun, nginx, ufw, clone repo
make ec2-sync-docs   # rsync skill docs to EC2 + restart (clears doc cache)
make ec2-deploy      # git pull → bun install → build → systemctl restart
make ec2-status      # service status + health check   (also: ec2-logs, ec2-restart, ec2-ssh)
```

Dev server runs on **port 5173** (Vite default). Production server defaults to
**port 3000**. The Makefile uses port 3001 (to avoid collision with a local
Hermes gateway on 3000).

## Conventions / Gotchas

- **Always use `bun`, never `npm` or `npx`.** This project uses Bun as
  its package manager and runtime. The `bun.lock` is the source of truth;
  `package-lock.json` is stale and should not be relied upon. Run scripts with
  `bun run <script>`, install deps with `bun install`, and run ad-hoc binaries
  with `bunx` (not `npx`).
- **`UIMessage` carries content in `parts`, not `content`.** The chat route
  explicitly validates this and returns 400 if legacy `{ role, content }`
  messages are posted.
- **Path aliases:** `~/*` and `@/*` both → `./app/*` (see `tsconfig.json`).
  `@/*` is used by shadcn/ui; `~/*` is React Router convention.
- **Conversations persist to Neon Postgres**, not localStorage — all
  persistence goes through API resource routes (`/api/conversations*`).
- **Optimistic UI:** `_auth._index.tsx` updates local state immediately,
  then persists asynchronously via fetch.
- **Document cache has no TTL:** `docCache`/`searchIndexCache` in
  `document-service.ts` persist for the process lifetime. Restart the
  service after updating documents (`make ec2-sync-docs` does this).
- **Custom CSS theme classes:** `pi-streaming-cursor`, `pi-pulse-dot`,
  `pi-thinking-text`, `pi-tool-pending/error/success`, `pi-diff-added/removed/`
  `context`, `pi-md-heading/code/link/quote/list-bullet` (`app/globals.css`).
- **`use-conversations.ts` is vestigial** — only the `ConversationMeta` type;
  CRUD lives in the route component and API routes.
- The skill dir (`~/.hermes/skills/...`) is environment-specific and untracked —
  don't hardcode its contents.

## Deployment

**Primary: EC2 (systemd + nginx + Let's Encrypt).** Runs on an EC2 Ubuntu
instance as a systemd service behind nginx with TLS via certbot on
`ontariochat.duckdns.org`. The Node.js build (`bun run build` →
`react-router-serve`) is the production runtime. Documents are read from
the filesystem, synced via `make ec2-sync-docs`.

| Concern | EC2 solution |
|---------|--------------|
| Process manager | `deploy/systemd/ontario-land-use-chat.service` |
| Reverse proxy / TLS | `deploy/nginx/ontario-land-use-chat.conf` + certbot |
| Document storage | Filesystem, synced via `make ec2-sync-docs` (rsync + restart) |
| Deploys | `make ec2-deploy` (git pull → bun install → build → systemctl restart) |
| Logs / status | `make ec2-logs` / `make ec2-status` |

Makefile `ec2-*` targets: `ec2-setup` (one-time provisioning),
`ec2-deploy`, `ec2-sync-docs`, `ec2-status`, `ec2-logs`, `ec2-restart`,
`ec2-ssh`. SSH: `ssh -i staff-gnarly-woof-ssh.pem ubuntu@ec2-18-222-140-19.us-east-2.compute.amazonaws.com`.

**Legacy: Mac launchd.** `deploy/launchd/*.plist` runs the app on a local
Mac via launchd + a Cloudflare quick tunnel for local dev only — not
production.

Full guide: `deploy/README.md`. One-time EC2 setup: `make ec2-setup`,
then create `/opt/ontario-land-use-chat/.env`, `bun run build`,
`sudo systemctl enable --now ontario-land-use-chat`, then
`sudo certbot --nginx -d ontariochat.duckdns.org` for TLS.
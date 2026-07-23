# Ontario Land Use Planning Chat

> **Maintenance directive:** Keep this file accurate. Update the relevant section when you add/remove/rename a file, change a dependency/script, or alter architecture. Prune stale notes. Keep under 16 KB / 300 lines; consolidate or link to a sub-doc if it grows.

A React Router v8 chat app wrapping an AI agent that assesses whether proposed development projects are feasible under Ontario's land use planning framework (provincial policy, provincial plans, official plans, zoning by-laws). Scope: 41 documents within ~150km of Peterborough.

> **Verify AI SDK / React Router APIs against installed versions** (newer than training cutoffs). Use Context7 for AI SDK; inspect `@react-router/*` types/docs for v8.

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
- **Neon Postgres** (`@neondatabase/serverless`, HTTP-based) for conversation/message storage
- **EC2 Ubuntu** (systemd + nginx + Let's Encrypt) for production; docs read from the filesystem, no R2/Workers
- **Tailwind v4** + **shadcn/ui** (`base-nova`) on **`@base-ui/react`** (NOT Radix); assistant UI uses **Vercel AI Elements** (`app/components/ai-elements/`, consumes `UIMessage` parts) — markdown via **Streamdown**, NOT react-markdown. See `docs/chat-ui.md`.

## Project Layout

```
app/
  root.tsx                       Root layout (HTML shell, TooltipProvider)
  routes.ts                      Flat file route config (flatRoutes from @react-router/fs-routes)
  entry.server.tsx               Custom SSR entry (Web Streams, Node 18+ compatible)
  globals.css                    Tailwind v4 + `@source` Streamdown + `pi-status-dot*` classes
  routes/
    _auth.tsx                    Pathless layout: authMiddleware + ensureSchema + chat shell (sidebar + Outlet); owns conversation state, activeId from URL `/c/<id>`
    _auth._index.tsx             Home (`/`): "Start a new assessment" placeholder → navigates to `/c/<id>`
    _auth.c.$conversationId.tsx  Conversation route (`/c/<id>`): bookmarkable URL per chat; renders <Chat>
    login.tsx / logout.tsx       Password login page / logout resource route (GET + POST)
    api.chat.ts                  Streaming chat endpoint (POST, SSE)
    api.conversations.ts*        GET/POST/PUT/DELETE conversations + messages
  auth/
    session.ts                   Cookie session storage, password check, auth helpers
    middleware.ts                v8 middleware: authMiddleware, apiAuthMiddleware
  db/
    client.ts                    Neon client, conversation/message CRUD, ensureSchema()
    schema.sql                   Database schema (conversations + messages, indexes)
  components/                    chat/ (see below) + ai-elements/ (Vercel AI Elements) + ui/ (shadcn/ui, base-ui)
  hooks/
    use-conversations.ts         ConversationMeta type only (CRUD moved to route layer)
    use-stream-status.ts         Chat stream status + stall timeout
    use-mobile.ts                Viewport breakpoint hook (768px)
  lib/
    chat-nav-context.ts          Shared context: sidebar list + nav/persist handlers between _auth layout and child routes
    ai-provider.ts               Ollama Cloud provider + MODEL_ID ("deepseek-v4-pro")
    agent/
      document-service.ts        Document read/list/search (filesystem), cache
      tools.ts                   AI SDK tool defs: readDocument, listDocuments, searchDocuments
      system-prompt.ts           Builds system prompt (SKILL.md + sections index + template + 10 rules)
    utils.ts                     cn() helper
skill/                             Vendored skill content (SKILL.md tracked;
  documents/                     Planning docs — GITIGNORED, synced to EC2 via rsync)
  templates/                      Report templates + examples — GITIGNORED, synced to EC2 via rsync)
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

`Chat` → `ChatInner` (owns `useChat`) → `ChatHeader`, `Conversation`,
`AssistantMessage`, `PromptInput`, `StreamStatusBar`. Migrated to Vercel AI
Elements (components in `app/components/ai-elements/`; `prompt-input.tsx` forked
for `@base-ui/react@1.6.0`). Full tree + accepted regressions: `docs/chat-ui.md`.

## How the Agent Works

`lib/agent/system-prompt.ts` assembles: `SKILL.md` (10-step assessment
procedure) and the top-level `sections-index.md`, plus 10 critical rules
(never fabricate, always cite, flag missing docs, check Bill 17 setbacks, use
GO/CONDITIONAL GO/CAUTION/NO-GO verdicts). Report structure follows the
10-step procedure (no hardcoded template file).

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

### Document Navigation & Storage

Documents live under the repo-vendored `skill/` directory:

| Path | Tracked? | Purpose |
|------|----------|---------|
| `skill/SKILL.md` | yes | 10-step assessment procedure |
| `skill/templates/` | **no** (gitignored) | Report templates + examples (feasibility-reports/, planning-justification-reports/) |
| `skill/documents/` | **no** (gitignored) | 1,676 planning .md files, split sections, indexes |

Large documents (200 KB–900 KB) are split by `scripts/split_markdown.py`
into section files with per-doc `_index.md` + top-level `sections-index.md`.
The agent navigates without loading whole documents:
`listDocuments()` → `sections-index.md` → `readDocument("<doc>/_index.md")`
→ `readDocument("<doc>/<section>.md")`.

`document-service.ts` resolves paths repo-relative: skill root `<repo>/skill/`
(override `LAND_USE_SKILL_DIR`), documents dir `<skill>/documents/` (override
`LAND_USE_DOCS_DIR`). `resolveSafe()` guards path traversal; locates the repo
root via `import.meta.url` (falls back to `process.cwd()`, set by systemd).

In-memory caches (`docCache`, `searchIndexCache`) persist for the process
lifetime with no TTL — restart the service to pick up doc updates.

### PDF → Markdown → Split Section Files Pipeline

1. **Convert:** `make convert-docs` → `scripts/convert_pdfs.py` (Marker + LLM,
   `deepseek-v4-flash`) → `./converted-docs/*.md`
2. **Copy:** `make copy-converted-docs` → skill `documents/` dir
3. **Split:** `make split-docs` → `split_markdown.py` → section files +
   `_index.md` per doc + top-level `sections-index.md`
4. **Sync to EC2:** `make ec2-sync-docs` (or `make ec2-deploy`) → rsync
   `skill/documents/` to EC2 + restart (clears the in-memory cache). Only
   `SKILL.md` is git-tracked; `documents/` and `templates/` are gitignored and
   rsync'd (`make ec2-sync-docs` / `make ec2-sync-templates`).

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
| `LAND_USE_SKILL_DIR` | no | `<repo>/skill` | Override the skill root (SKILL.md, templates, documents) |
| `LAND_USE_DOCS_DIR` | no | `<skill>/documents` | Override only the documents directory |

On EC2, all env vars live in `/opt/ontario-land-use-chat/.env` (loaded by the
systemd unit's `EnvironmentFile` and by `vite.config.ts` `loadEnv` at build time).

## Commands

```bash
make install              # bun install
make dev                  # bun dev (local Node.js, filesystem docs)
make prod                 # build + start
make convert-docs         # PDF→MD via scripts/convert_pdfs.py (Marker + LLM)
make copy-converted-docs  # copy converted-docs/*.md to skill documents dir
make split-docs           # split .md docs into section files + indexes
make docs-pipeline        # full pipeline: convert + copy + split + EC2 sync
make docs-pipeline-no-sync # local only: convert + copy + split (no EC2)
bun run db:setup          # create Neon Postgres schema
bun run typecheck         # react-router typegen && tsc --noEmit
./scripts/kanban-init.sh  # (re)create the local SQLite kanban board
bun run setup:hooks       # (re)install git hooks (pre-commit guard + pre-push EC2 reminder)

make ec2-setup       # one-time: install Node, Bun, nginx, ufw, clone repo
make ec2-sync-docs   # rsync skill/documents/ to EC2 + restart (doc-only)
make ec2-sync-templates # rsync skill/templates/ to EC2 + restart (template-only)
make ec2-deploy      # rsync docs+templates + git pull + build + restart
make ec2-status      # service status + health check (also: ec2-logs, ec2-restart, ec2-ssh)
```

Dev server runs on **port 5173** (Vite default). Production defaults to
**port 3000**. The Makefile uses port 3001 (Hermes gateway on 3000).

## Conventions / Gotchas

- **Always use `bun`, never `npm` or `npx`.** `bun.lock` is the source of truth
  (`package-lock.json` is stale). Run scripts with `bun run`, deps with
  `bun install`, ad-hoc binaries with `bunx`.
- **`UIMessage` carries content in `parts`, not `content`.** The chat route
  explicitly validates this and returns 400 if legacy `{ role, content }`
  messages are posted.
- **Path aliases:** `~/*` and `@/*` both → `./app/*` (see `tsconfig.json`).
  `@/*` is used by shadcn/ui; `~/*` is React Router convention.
- **Conversations persist to Neon Postgres**, not localStorage — all
  persistence goes through API resource routes (`/api/conversations*`).
- **Optimistic UI:** The `_auth.tsx` layout updates the conversation list
  immediately, then persists asynchronously via fetch. `activeId` is derived
  from the URL (`/c/<id>`), so chats are bookmarkable/refreshable independently.
- **Skill content is vendored at `skill/`**: only `SKILL.md` is git-tracked; `documents/` and `templates/` are gitignored + rsync'd to EC2 (`make ec2-sync-docs` / `make ec2-sync-templates`). `LAND_USE_SKILL_DIR`/`LAND_USE_DOCS_DIR` override paths.
- **Custom CSS theme classes:** only `pi-status-dot*` remain (for `StreamStatusBar`); the rest were dropped in the AI Elements migration (see `docs/chat-ui.md`).
- **`use-conversations.ts` is vestigial** — only the `ConversationMeta` type; CRUD lives in the `_auth.tsx` layout and API routes.

## Deployment

**Primary: EC2 (systemd + nginx + Let's Encrypt).** Runs on an EC2 Ubuntu
instance as a systemd service behind nginx with TLS via certbot on
`ontariochat.duckdns.org`. The Node.js build (`bun run build` →
`react-router-serve`) is the production runtime. Documents are read from
the repo-vendored `skill/documents/` tree (gitignored), synced via
`make ec2-deploy` (or `make ec2-sync-docs` for doc-only updates,
`make ec2-sync-templates` for template-only updates).

| Concern | EC2 solution |
|---------|--------------|
| Process manager | `deploy/systemd/ontario-land-use-chat.service` |
| Reverse proxy / TLS | `deploy/nginx/ontario-land-use-chat.conf` + certbot |
| Document storage | Filesystem under `skill/documents/` (gitignored), synced via `make ec2-deploy` / `make ec2-sync-docs` (rsync + restart) |
| Report templates | Filesystem under `skill/templates/` (gitignored), synced via `make ec2-deploy` / `make ec2-sync-templates` (rsync + restart) |
| Deploys | `make ec2-deploy` (git pull → bun install → build → systemctl restart) |
| Logs / status | `make ec2-logs` / `make ec2-status` |

Makefile `ec2-*` targets: `ec2-setup`, `ec2-deploy`, `ec2-sync-docs`, `ec2-sync-templates`, `ec2-status`, `ec2-logs`, `ec2-restart`, `ec2-ssh`. SSH details in the Makefile (`EC2_KEY`/`EC2_HOST`).

**Legacy: Mac launchd.** `deploy/launchd/*.plist` — local dev only, not production. Guide: `deploy/README.md`.
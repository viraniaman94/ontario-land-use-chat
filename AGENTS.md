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

## Tech Stack

- **React Router v8** (framework mode, SSR, flat file routing, middleware) +
  **React 19**
- **Vite 7** as the build tool (Environment API)
- **Bun** as package manager / runtime
- **AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`) — UI uses
  `UIMessage[]` with a `parts` array (NOT a `content` string)
- **OpenAI-compatible LLM provider** — Ollama Cloud, model `glm-5.2`
  (`OLLAMA_API_KEY`, base URL `https://ollama.com/v1`)
- **Neon Postgres** (`@neondatabase/serverless` — HTTP-based, serverless-friendly)
  for persistent conversation and message storage
- **Cloudflare Workers** + **R2** for production deployment; **Node.js** +
  filesystem for local dev (toggled by `CLOUDFLARE=1` env var)
- **Tailwind v4** + **shadcn/ui** (`base-nova` style) on **`@base-ui/react`**
  primitives (NOT Radix)
- **react-markdown** + **remark-gfm** + **rehype-highlight** for rendering
  assistant messages
- **pdf-parse v2** for PDF text extraction (legacy fallback; Marker-converted
  Markdown preferred)

## Project Layout

```
app/
  root.tsx                       Root layout (HTML shell, TooltipProvider, r2StorageMiddleware)
  routes.ts                      Flat file route config (flatRoutes from @react-router/fs-routes)
  entry.server.tsx               Custom SSR entry (Web Streams for Cloudflare Workers compat)
  globals.css                    Tailwind v4 + custom pi-* theme classes
  routes/
    _auth.tsx                    Pathless layout: authMiddleware guard + DB schema init
    _auth._index.tsx             Home page: sidebar + chat, conversation CRUD (optimistic UI)
    login.tsx                    Password login page (public, no auth)
    logout.tsx                   Logout resource route (GET + POST)
    api.chat.ts                  Streaming chat endpoint (POST, SSE, maxDuration 300)
    api.conversations.ts         GET list / POST create conversations
    api.conversations.$id.ts     GET / PUT / DELETE conversation + messages
  auth/
    session.ts                   Cookie session storage, password check, auth helpers
    middleware.ts                v8 middleware: authMiddleware, apiAuthMiddleware, r2StorageMiddleware
  db/
    client.ts                    Neon client, conversation/message CRUD, ensureSchema()
    schema.sql                   Database schema (conversations + messages, indexes)
  components/
    chat/                        Chat UI (see below)
    ui/                          13 vendored shadcn/ui primitives (base-ui based)
  hooks/
    use-conversations.ts          ConversationMeta type only (CRUD moved to route layer)
    use-mobile.ts                Viewport breakpoint hook (768px)
  lib/
    ai-provider.ts               Ollama Cloud provider + MODEL_ID ("glm-5.2")
    agent/
      document-service.ts        Document read/list/search, R2 + filesystem dual-mode, cache
      tools.ts                   AI SDK tool defs: readDocument, listDocuments, searchDocuments
      system-prompt.ts           Builds system prompt (SKILL.md + sections index + template + 10 rules)
    utils.ts                     cn() helper
scripts/
  convert_pdfs.py                Marker + LLM PDF→Markdown converter; writes ./converted-docs/*.md
  split_markdown.py              Splits .md docs into section files with _index.md + sections-index.md
  setup-db.mjs                   Creates Neon Postgres schema from app/db/schema.sql
  upload-to-r2.mjs               Differential upload of skill docs to Cloudflare R2 bucket
  convert-report.{json,csv}      Quality report from last conversion run
  requirements.txt              Pins marker-pdf version (installed via uvx, not project deps)
workers/
  app.ts                         Cloudflare Workers entry: env→process.env bridge, R2 globalThis wiring
deploy/
  launchd/*.plist                launchd agents (NOTE: app plist is stale — references next start)
  scripts/start-tunnel.sh         Quick Cloudflare tunnel launcher
Makefile                         install/dev/build/prod, tunnel, launchd, convert-docs, split-docs
vite.config.ts                   Vite config (conditional @cloudflare/vite-plugin, env injection)
react-router.config.ts           React Router config (ssr: true)
wrangler.jsonc                   Cloudflare Workers config (R2 binding, nodejs_compat, observability)
tsconfig.json                    TS config (strict, ~/* and @/* → ./app/*)
components.json                  shadcn/ui config (base-nova style, base-ui primitives)
converted-docs/                  Marker-converted Markdown docs (gitignored)
```

### Chat Component Tree

```
Chat (loads conversation from DB, persist guard)
 └─ ChatInner (memoized, owns useChat)
     ├─ ChatHeader (static title bar + sidebar trigger)
     ├─ ChatMessages (auto-scroll, empty state, "Analyzing…" indicator)
     │   ├─ AssistantMessage (parts router)
     │   │   ├─ MarkdownContent (text parts — react-markdown + remark-gfm)
     │   │   ├─ ThinkingBlock (reasoning parts — collapsible)
     │   │   ├─ ToolCallBlock (tool-* / dynamic-tool parts — state-tinted)
     │   │   └─ step-start separator
     │   └─ ChatMessage (user messages — chat bubble)
     └─ ChatInput (textarea + send/stop button)
```

### Vendored shadcn/ui Components (13)

`avatar`, `bubble` (custom, not from registry), `button`, `card`, `input`,
`scroll-area`, `separator`, `sheet`, `sidebar` (722 lines — the largest),
`skeleton`, `sonner`, `textarea`, `tooltip`. All based on `@base-ui/react`
primitives (not Radix UI).

## How the Agent Works

The system prompt is assembled in `lib/agent/system-prompt.ts` from:
1. `SKILL.md` (10-step assessment procedure)
2. `templates/feasibility-report.md` (report template)
3. Top-level document navigation index (`sections-index.md`)

Plus 10 critical rules (never fabricate, always cite, flag missing docs, check
Bill 17 setbacks, use GO/CONDITIONAL GO/CAUTION/NO-GO verdicts, etc.).

The agent has 3 tools (defined in `lib/agent/tools.ts`, backed by
`document-service.ts`):

- **`readDocument(path)`** — reads any `.md` file or section file from the skill
  documents directory (truncated to 50K chars, cached in-memory).
- **`listDocuments()`** — returns the top-level `sections-index.md` navigation
  index (falls back to `document-index.md`).
- **`searchDocuments(query)`** — case-insensitive AND-search across all section
  indexes (top-level + per-document `_index.md` files). Results capped at 200.

The chat route (`api.chat.ts`) wraps `streamText({ model, system, messages,
tools, stopWhen: isStepCount(20), temperature: 0.2 })` and returns a UI message
stream (SSE) via `createUIMessageStreamResponse`.

### Document Navigation

All planning documents are stored as `.md` files. Large documents (200 KB –
900 KB) are split into individual section files by `scripts/split_markdown.py`,
creating a navigable directory structure:

```
documents/
  sections-index.md           # Top-level index: every doc + section count + paths
  provincial/
    pps-2024.md               # Full document (if needed)
    pps-2024/                 # Split sections directory
      _index.md               # Per-doc index: all sections w/ 1-line summaries
      00-provincial-planning-statement-2024.md
      02-vision.md
      06-22-housing.md
      ...
  upper-tier/...
  single-tier/...
  zoning/...
```

The agent navigates without loading entire large documents:
1. `listDocuments()` → top-level `sections-index.md` (which docs exist)
2. `readDocument("provincial/pps-2024/_index.md")` → section list w/ summaries
3. `readDocument("provincial/pps-2024/06-22-housing.md")` → specific section

### Dual-Mode Document Storage

- **R2 mode (Cloudflare Workers):** Activated when `setDocumentStorage(bucket)`
  is called (from `r2StorageMiddleware` at root level, wired via
  `globalThis.__R2_BUCKET` in `workers/app.ts`). Document keys are prefixed
  with `documents/`.
- **Filesystem mode (local dev):** Fallback when no R2 bucket is set. Reads
  from `LAND_USE_DOCS_DIR` or default `~/.hermes/skills/ontario-land-use-feasibility/documents`.
  Uses `resolveSafe()` for path traversal protection. Node built-ins (`fs`,
  `path`, `os`) are loaded via lazy `eval("require")` to avoid bundler issues.

In-memory caches (`docCache`, `searchIndexCache`) persist for the process/isolate
lifetime with no TTL.

### PDF → Markdown → Split Section Files Pipeline

1. **Convert:** `make convert-docs` runs `scripts/convert_pdfs.py` (Marker +
   LLM, model `deepseek-v4-flash` via Ollama Cloud) → `./converted-docs/*.md`
2. **Copy:** `make copy-converted-docs` copies `.md` files to the skill's
   `documents/` directory
3. **Split:** `make split-docs` runs `split_markdown.py` (marko parser) →
   individual section files + `_index.md` per doc + top-level `sections-index.md`
4. **Upload to R2:** `bun run r2:upload` runs `scripts/upload-to-r2.mjs`
   (differential upload to Cloudflare R2 bucket `ontario-land-use-docs`)

## Authentication

Single hardcoded password protects the app — no user accounts, no registration.

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_PASSWORD` | `ontario2025` | Override via env var |
| `SESSION_SECRET` | (dev default) | 32+ char random string for prod |

Auth is enforced via React Router v8 middleware:
- **`authMiddleware`** (browser routes) — redirects to `/login` if not
  authenticated. Applied to `_auth.tsx` pathless layout.
- **`apiAuthMiddleware`** (API routes) — returns 401 JSON if not authenticated.
  Applied to all `api.*` routes.
- **`r2StorageMiddleware`** (root) — wires R2 bucket into document service on
  every request.

Session is a signed cookie (`createCookieSessionStorage`), `httpOnly: true`,
`sameSite: "lax"`, `secure` in production.

## Database (Neon Postgres)

| Table | Columns |
|-------|---------|
| `conversations` | id (PK), title, created_at, updated_at |
| `messages` | id (PK), conversation_id (FK → conversations ON DELETE CASCADE), role, parts (JSONB), created_at |

- Schema is auto-created on first server load via `ensureSchema()` (idempotent
  `IF NOT EXISTS`, guarded by module-level flag).
- Messages stored as JSONB to preserve full `UIMessage` structure (text parts,
  reasoning parts, tool-call parts).
- `replaceMessages()` does delete-then-insert (no transaction — partial failure
  risk).
- `listConversations()` returns all rows (no pagination).

## Environment

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | yes | — | Neon Postgres connection string |
| `OLLAMA_API_KEY` | yes | — | Ollama Cloud API key |
| `OLLAMA_BASE_URL` | no | `https://ollama.com/v1` | Override LLM endpoint |
| `APP_PASSWORD` | no | `ontario2025` | Single shared access password |
| `SESSION_SECRET` | no | (dev default) | Cookie signing secret (32+ chars) |
| `LAND_USE_DOCS_DIR` | no | skill `documents/` | Override filesystem docs directory |

For Cloudflare Workers: `DATABASE_URL`, `OLLAMA_API_KEY`, `SESSION_SECRET` are
set via `wrangler secret put`. `OLLAMA_BASE_URL` and `APP_PASSWORD` are in
`wrangler.jsonc` vars. R2 binding `DOCUMENTS` → bucket `ontario-land-use-docs`.

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

# Cloudflare Workers mode
bun run cf:dev            # CLOUDFLARE=1 react-router dev (workerd runtime)
bun run cf:build          # CLOUDFLARE=1 react-router build
bun run cf:deploy         # build + wrangler deploy
bun run cf:tail           # wrangler tail (live logs)
bun run r2:upload         # upload docs to R2 bucket
bun run setup:hooks       # (re)install git hooks (pre-commit size guard + pre-push deploy)
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
- **Conversations persist to Neon Postgres**, not localStorage. All persistence
  goes through API resource routes (`/api/conversations*`).
- **Optimistic UI:** the home route (`_auth._index.tsx`) updates local state
  immediately, then persists asynchronously via fetch calls.
- **Dual-mode architecture:** `CLOUDFLARE=1` toggles between Node.js (filesystem
  document access) and Workers (R2 document access). Document service uses
  `globalThis.__R2_BUCKET` to detect mode.
- **`workers/app.ts` is NOT type-checked** by `tsc --noEmit` — it's excluded
  from `tsconfig.json` includes. Run `bun run cf:typegen` for Wrangler types.
- **Custom CSS theme classes:** `pi-streaming-cursor`, `pi-pulse-dot`,
  `pi-thinking-text`, `pi-tool-pending/error/success`, `pi-diff-added/removed/
  context`, `pi-md-heading/code/link/quote/list-bullet` — defined in
  `app/globals.css`.
- **`use-conversations.ts` is vestigial** — contains only the
  `ConversationMeta` type. CRUD logic lives in the route component and API
  routes.
- The skill dir (`~/.hermes/skills/...`) is environment-specific and untracked.
  Don't hardcode its contents.
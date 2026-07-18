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
   →  GLM-5.2 (Ollama Cloud, OpenAI-compatible) streams a response
   →  when the model needs a document, it calls a server-side tool:
        listDocuments()      — returns the document index
        searchDocuments(q)   — grep the index for matching entries
        readDocument(path)   — reads a Markdown/PDF/HTML file from disk
   →  tokens stream back to the browser and render as markdown
   →  on stream completion, messages are persisted to Neon Postgres
```

Planning documents are **read from disk** — they are not bundled, uploaded,
or sent to a vector store. The skill is vendored in the repo at `skill/`
(`SKILL.md`, `templates/`, `references/` tracked; `documents/` gitignored,
~269 MB across 41 files, synced to EC2 via rsync during deploy).

## Tech stack

- **React Router v8** (framework mode, SSR, resource routes, flat file routing,
  middleware)
- **Vite 7** as the build tool (Environment API)
- **React 19.2.7+**
- **shadcn/ui v4** on **Tailwind CSS v4** (sidebar, sheet, button, textarea,
  card, scroll-area, separator, avatar, skeleton, sonner, tooltip)
- **AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`)
- **Neon Postgres** (`@neondatabase/serverless` — HTTP-based, serverless-friendly)
  for persistent conversation and message storage
- **v8 Middleware-based auth** (single hardcoded password, no user accounts;
  cookie session via `createCookieSessionStorage`)
- **react-markdown** + **remark-gfm** for rendering assistant messages
- **TypeScript**, **Bun**

## LLM provider

The agent talks to Ollama Cloud's OpenAI-compatible endpoint:

| Setting        | Value                                   |
|----------------|-----------------------------------------|
| Base URL       | `https://ollama.com/v1`                 |
| Endpoint       | `POST /chat/completions`                |
| Model          | `glm-5.2`                               |
| Env var        | `OLLAMA_API_KEY`                        |

## Database (Neon Postgres)

All conversations and messages are persisted to a Neon Postgres database.
The schema is auto-created on first server load (idempotent `IF NOT EXISTS`).

| Table            | Columns                                           |
|------------------|---------------------------------------------------|
| `conversations`  | id (PK), title, created_at, updated_at            |
| `messages`        | id (PK), conversation_id (FK), role, parts (JSONB), created_at |

Messages are stored as JSONB to preserve the full `UIMessage` structure
(text parts, reasoning parts, tool-call parts, etc.).

## Authentication

A single hardcoded password protects the app — no user accounts, no
registration. The password is checked via a signed cookie session.

| Variable       | Default       | Notes                              |
|----------------|---------------|------------------------------------|
| `APP_PASSWORD`  | `ontario2025` | Override via env var               |
| `SESSION_SECRET`| (dev default) | 32+ char random string for prod    |

## Prerequisites

- **Node 22.22+** (required by React Router v8)
- **Bun 1.3+** — `brew install bun`
- A valid `OLLAMA_API_KEY`
- A Neon Postgres database (free tier at [neon.tech](https://neon.tech))
- The land-use skill is vendored in the repo at `skill/` (the scaffolding is
  tracked in git; the `documents/` tree is gitignored and synced to EC2 via
  `make ec2-deploy` / `make ec2-sync-docs`).

## Install

```bash
cd ontario-land-use-chat
bun install
cp .env.example .env
# Edit .env and set:
#   DATABASE_URL     — your Neon connection string
#   OLLAMA_API_KEY   — your Ollama Cloud API key
#   APP_PASSWORD     — (optional, defaults to "ontario2025")
#   SESSION_SECRET   — (optional in dev, required in production)
```

## Set up the database

```bash
bun run db:setup
```

This creates the `conversations` and `messages` tables in your Neon
database. The schema is also auto-created on first server load.

## Run locally

```bash
bun dev
```

Open <http://localhost:5173/>. You'll be redirected to `/login` — enter
the password (default: `ontario2025`) to access the app.

## Production build & start

```bash
bun run build
bun run start
```

## Configuration

| Variable                 | Required | Default                              | Notes                          |
|--------------------------|----------|--------------------------------------|--------------------------------|
| `DATABASE_URL`           | yes      | —                                    | Neon Postgres connection string |
| `OLLAMA_API_KEY`         | yes      | —                                    | API key for Ollama Cloud       |
| `APP_PASSWORD`           | no       | `ontario2025`                        | Single shared access password  |
| `SESSION_SECRET`         | no       | (dev default)                        | Cookie signing secret (32+ chars) |
| `OLLAMA_BASE_URL`        | no       | `https://ollama.com/v1`              | Override upstream base URL     |
| `LAND_USE_DOCS_DIR`      | no       | skill `documents/`                   | Override documents directory   |
| `PORT`                   | no       | `3000`                               | Production server listen port  |

## Architecture

```
app/
  root.tsx                      Root layout, fonts, TooltipProvider
  routes.ts                     Flat file route config (flatRoutes)
  routes/
    _auth.tsx                   Pathless layout: auth guard + DB init
    _auth._index.tsx            Main chat page (DB-backed conversations)
    login.tsx                   Password login page
    logout.tsx                  Logout resource route
    api.chat.ts                 Streaming chat resource route (SSE)
    api.conversations.ts        GET list / POST create conversations
    api.conversations.$id.ts    GET / PUT / DELETE conversation + messages
  auth/
    session.ts                  Cookie session, password check, auth helpers
    middleware.ts               v8 middleware (authMiddleware, apiAuthMiddleware)
  db/
    client.ts                   Neon client, conversation/message CRUD
    schema.sql                  Database schema (conversations + messages)
  components/
    chat/                       chat-header, chat-messages, chat-input,
                                 chat-message, chat-sidebar, chat,
                                 assistant-message, thinking-block,
                                 tool-call-block, markdown-content
    ui/                         shadcn/ui primitives
  hooks/
    use-conversations.ts        ConversationMeta type
    use-mobile.ts               Breakpoint hook (shadcn sidebar)
  lib/
    ai-provider.ts              Ollama Cloud provider config
    agent/
      document-service.ts       Read documents from skill dir (path-safe)
      system-prompt.ts          Build system prompt from SKILL.md + index
      tools.ts                  listDocuments / searchDocuments / readDocument
    utils.ts                    cn() helper
```

## How documents work

The agent never uploads PDFs to the LLM. Instead:

1. The system prompt embeds the full **document index**
   (`documents/document-index.md`) so the model knows what exists and the
   relative paths to use.
2. The model calls `readDocument(relPath)` to pull a specific file.
   The route handler resolves the path with transparent content mapping:
   **.pdf** files are first looked up as `.md` replacements under the
   Marker-converted directory (`./converted-docs/<relpath>.md`); if found,
   the structured Markdown is returned (tables preserved as GFM). If no
   Markdown conversion exists yet, it falls back to extracting text from
   the original PDF via `pdf-parse`. **.html** files are always read from
   the original skill documents directory.
3. Read documents are cached in-memory for the server's lifetime.

## Conversation persistence

Conversations are stored in **Neon Postgres**. When a chat stream completes,
the client sends a `PUT /api/conversations/:id` with the full message array.
Messages are stored as JSONB to preserve the complete `UIMessage` structure.
The left sidebar lists past chats sorted by most recently updated.

## Limitations & known gaps

- **PDF extraction quality** — `pdf-parse` may produce messy output for
  complex zoning by-law tables. The agent reads Marker-converted Markdown
  (`./converted-docs/<relpath>.md`) when available.
- **Token budget** — documents are truncated to 50K chars per read.
- **Single password auth** — there is no multi-user support. Anyone with
  the shared password can access all conversations.
- **Preliminary assessment only** — findings must be reviewed by a
  registered professional planner (RPP) before relying on them.
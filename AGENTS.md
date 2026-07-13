<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Ontario Land Use Planning Chat

A Next.js chat app wrapping an AI agent that assesses whether proposed
development projects are feasible under Ontario's land use planning
framework (provincial policy, provincial plans, municipal official plans,
zoning by-laws). Scope: 41 planning documents within ~150km of Peterborough.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **Bun** as package manager / runtime (`make install`, `bun dev`)
- **AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`) — UI uses
  `UIMessage[]` with a `parts` array (NOT a `content` string)
- **OpenCode Go Zen** as the LLM provider (OpenAI-compatible endpoint), model `glm-5.2`
  — proxied health is unknown; never assume provider-specific features
- **Tailwind v4** + **shadcn/ui** + **base-ui** components
- **pdf-parse v2** for PDF text extraction (lazy-loaded, dynamically imported)

> Before relying on any AI SDK / Next.js API detail, verify against the
> installed versions — these are newer than most training cutoffs. Read
> `node_modules/next/dist/docs/` for Next.js, and inspect `ai` package types
> or use Context7 for AI SDK APIs.

## Project Layout

```
app/
  api/chat/route.ts        Streaming chat endpoint (POST, SSE, runtime=nodejs, maxDuration=300)
  page.tsx                 Client home: sidebar + active chat shell
  layout.tsx, globals.css  Root layout + Tailwind/global styles
components/
  chat/                    Chat UI: chat, chat-input, chat-messages, chat-message,
                           chat-header, chat-sidebar.tsx
  ui/                      shadcn/ui primitives (button, card, sidebar, sheet, ...)
hooks/
  use-conversations.ts     localStorage-backed conversation CRUD + persistence
  use-mobile.ts            viewport hook
lib/
  ai-provider.ts           OpenCode Go provider + MODEL_ID ("glm-5.2")
  agent/
    document-service.ts    Core: document read/list/search, split-section navigation, path-traversal guard, cache
    tools.ts               AI SDK tool defs: readDocument, listDocuments, searchDocuments
    system-prompt.ts       Builds system prompt (SKILL.md + sections index + template + 10 rules)
  utils.ts                 cn() helper
scripts/
  convert_pdfs.py          Marker + LLM PDF→Markdown converter; writes ./converted-docs/*.md
  convert-report.{json,csv} Quality report from last conversion run
  split_markdown.py        Splits .md docs into individual section files with
                           per-document _index.md + top-level sections-index.md
                           (uses marko via `uv run --with marko`)
converted-docs/            Marker-converted Markdown docs (repo-local, gitignored;
                           copied into the skill dir via `make copy-converted-docs`)
deploy/
  launchd/*.plist          launchd agents to keep app + cloudflared tunnel alive on reboot
  scripts/start-tunnel.sh
Makefile                   install/dev/build/prod, tunnel setup, launchd load/unload,
                           convert-docs*, copy-converted-docs, split-docs
```

## How the Agent Works

The system prompt is assembled in `lib/agent/system-prompt.ts` from `SKILL.md`
+ `templates/feasibility-report.md` + the top-level sections index, plus 10
hard rules (never fabricate, always cite, flag missing docs, check Bill 17
setbacks, etc.). The agent has 3 tools (defined in `lib/agent/tools.ts`):

- `readDocument(path)` — reads any .md file or section file from the skill
  documents directory (truncated to 50k chars).
- `listDocuments()` — returns the top-level `sections-index.md` navigation index.
- `searchDocuments(query)` — AND-search across all section indexes (top-level
  + per-document `_index.md` files).

The chat route wraps `streamText({ model, system, messages, tools, stopWhen:
isStepCount(20), temperature: 0.2 })` and returns a UI message stream (SSE).

### Document Navigation (the heart of `document-service.ts`)

All planning documents are stored as `.md` files in the skill's `documents/`
directory (`~/.hermes/skills/ontario-land-use-feasibility/documents/`).
Large documents (200 KB – 900 KB) are split into individual section files
by `scripts/split_markdown.py`, creating a navigable directory structure:

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

The agent navigates this structure without loading entire large documents:
1. `listDocuments()` → top-level `sections-index.md` (which docs exist)
2. `readDocument("provincial/pps-2024/_index.md")` → section list w/ summaries
3. `readDocument("provincial/pps-2024/06-22-housing.md")` → specific section

`readDocument` resolves paths via `resolveSafe()` (path traversal guard) and
caches results in an in-memory `docCache` Map. `searchDocuments` walks all
category subdirectories, reads each `_index.md`, and returns matching lines.

The document **index is always read from the skill documents dir** —
`sections-index.md` is the top-level index (generated by `split_markdown.py`),
and each document's `_index.md` is its section-level index.

### PDF → Markdown → Split Section Files Pipeline

1. **Convert:** `make convert-docs` runs `scripts/convert_pdfs.py` (Marker + LLM)
   to convert PDFs to `.md` files in `./converted-docs/`.
2. **Copy:** `make copy-converted-docs` copies the `.md` files into the skill's
   `documents/` directory (alongside the original PDFs/HTML).
3. **Split:** `make split-docs` runs `scripts/split_markdown.py` which uses the
   `marko` markdown parser to split each `.md` into individual section files
   with per-document `_index.md` files and a top-level `sections-index.md`.

## Environment

`.env.local` (gitignored) must contain:
- `OLLAMA_API_KEY` — required for the LLM provider.

See `.env.example`.

## Commands

```bash
make install              # bun install
make dev                  # bun dev on PORT (default 3001)
make prod                 # build + start on PORT
make convert-docs         # run scripts/convert_pdfs.py (PDF→MD)
make convert-docs-dry     # preview the file list
make copy-converted-docs  # copy converted-docs/*.md to skill documents dir
make split-docs           # split .md docs into section files + indexes
bunx tsc --noEmit         # typecheck
```

Port defaults to **3001** (3000 is occupied by the local Hermes gateway).

## Conventions / Gotchas

- **`UIMessage` carries content in `parts`, not `content`.** The chat route
  explicitly validates this and returns a clear 400 if legacy
  `{ role, content }` messages are posted — `convertToModelMessages` throws a
  cryptic error otherwise.
- Path alias: `@/*` → `./*` (see `tsconfig.json`).
- Conversations persist to **localStorage** only; there is no backend auth or DB.
- The skill dir (`~/.hermes/skills/...`) is environment-specific and untracked —
  code assumes it exists on the host. Don't hardcode its contents.
- When editing shadcn/ui components, they're vendored in `components/ui/` and
  styled with Tailwind v4 + `cva`; check `components.json`.
- Deploy is native macOS via launchd + Cloudflare Tunnel (see `deploy/README.md`).
  The `/api/chat` SSE stream works through a named tunnel; quick tunnels are
  dev-only and have a 200-concurrent-request cap.
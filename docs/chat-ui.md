# Chat UI — AI Elements Architecture

Detail offloaded from `AGENTS.md` (Chat Component Tree). The agent UI was
migrated from hand-rolled components to **Vercel AI Elements** (shadcn/ui-based,
props-driven, consumes AI SDK v7 `UIMessage` parts directly).

## Component Tree

`Chat` (loads conversation from DB, persist guard) → `ChatInner` (memoized,
owns `useChat`) → `ChatHeader`, `Conversation` (AI Elements; auto-scroll via
`use-stick-to-bottom`, empty state, "Analyzing…" placeholder),
`AssistantMessage` (routes `UIMessage` parts → `MessageResponse` text
[Streamdown], `Reasoning` reasoning, `Tool`/`ToolHeader`/`ToolInput`/`ToolOutput`
tool-* [state badges: pending/running/output/error], `step-start` custom
separator; user messages render inline as `Message from="user"`),
`PromptInput` (AI Elements; textarea + `PromptInputSubmit` send/stop, built-in
Enter-to-submit), `StreamStatusBar` (custom, always-on stream-state line; keeps
`useStreamStatus` stall-timeout hook + `pi-status-dot*` classes).

## AI Elements Components

Live in `app/components/ai-elements/`, copied in by
`bunx ai-elements@latest add <name>`. Installed: `tool`, `code-block`,
`reasoning`, `message`, `conversation`, `prompt-input`, `shimmer` (+ shadcn
primitives: `badge`, `collapsible`, `select`, `button-group`, `command`,
`dialog`, `dropdown-menu`, `hover-card`, `input-group`, `spinner`).

**Install-path gotcha:** `bunx ai-elements add` writes to a top-level
`./components/ai-elements/` dir, NOT `app/`. tsconfig only includes `app/**`, so
files must be moved into `app/components/ai-elements/` after install or tsc
won't check them.

**Fork:** `prompt-input.tsx` was forked for `@base-ui/react@1.6.0` — removed
`BaseUIEvent<SyntheticEvent<…>>` wrappers (use plain `React.SyntheticEvent`) and
`PreviewCard` `openDelay`/`closeDelay` props (not in v1.6.0). Added a custom
`onStop` prop on `PromptInputSubmit`.

## Markdown Rendering

`MessageResponse` (assistant text) and `ReasoningContent` (reasoning) render via
**Streamdown** (Shiki code, KaTeX math, Mermaid diagrams, remend for
streaming-safe unterminated-block parsing) — NOT react-markdown. Requires
`@source "../node_modules/streamdown/dist/*.js";` in `app/globals.css` so
Tailwind v4 keeps Streamdown's classes.

## What Stayed Custom

- `StreamStatusBar` + `useStreamStatus` (stall timeout, elapsed timer,
  complete-hold, `markSend`/`markStop`) — AI Elements has no stream-status
  equivalent. Keeps the `pi-status-dot*` CSS classes.
- `ChatHeader`, `ChatSidebar` — not coupled to chat internals.

## Accepted Regressions (from the migration)

- `pi-md-*` custom theme colors lost (Streamdown default styling).
- Per-tool keyArg display (`readDocument`→path, `searchDocuments`→query) +
  diff-line (`+`/`-`/`@@`) styling lost — `Tool` shows name + state badge;
  `ToolOutput` renders via `CodeBlock` (Shiki) with no diff awareness.
- `MarkdownContent`'s `thinking` prop fenced-code stripping lost —
  `ReasoningContent` renders raw reasoning text via Streamdown.

## Unchanged by the Migration

Backend (`api.chat.ts` `streamText`, `lib/agent/tools.ts`,
`system-prompt.ts`, `document-service.ts` filesystem RAG), Neon Postgres
persistence + `UIMessage` JSONB round-trip, auth/middleware, React Router v8
routes, `useChat` wiring + `onFinish`→persist path, deploy.
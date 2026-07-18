# Next.js Web App — Agent Layer Reference

Architecture and code patterns for the `ontario-land-use-chat` Next.js app
(`/Users/amanv/Projects/ontario-land-use-chat`) that operationalizes the
ontario-land-use-feasibility skill as a streaming chat agent.

## Stack (verified July 2026)

| Package | Version | Notes |
|--------|---------|-------|
| `next` | 16.2.10 | Turbopack. See `node_modules/next/dist/docs/` — this Next.js has breaking changes vs. training data; consult the bundled docs before writing route/server code. |
| `ai` (AI SDK) | 7.0.16 | v7 patterns — `convertToModelMessages` is **async**; `streamText` + `createUIMessageStreamResponse` is the canonical streaming route. |
| `@ai-sdk/openai-compatible` | ^3.0.5 | `chatEndpoint` is NOT a valid setting; the package auto-appends `/chat/completions` to `baseURL`. |
| `zod` | ^4.4.3 | Tools use `inputSchema` (Zod v4). |
| `pdf-parse` | ^2.4.5 | PDF text extraction in `document-service.ts`. |

> **Before writing Next.js route/server code in this project**: `AGENTS.md` at
> the repo root warns that this Next.js version has breaking changes. Read the
> relevant guide under `node_modules/next/dist/docs/01-app/` first. Confirmed
> non-standard in this version: `context.params` is a Promise (await it),
> default caching for `GET` changed from static to dynamic, route segment
> config exports (`runtime`, `maxDuration`) still work as documented in
> `…/03-file-conventions/02-route-segment-config/`.

## lib/agent/ module responsibilities

- **`document-service.ts`** — `readDocument(path)`, `listDocuments()`,
  `searchDocuments(query)`. Path-traversal-protected reads from the skill's
  `documents/` dir, in-memory cache, 50K-char truncation. Uses `pdf-parse` v2.
- **`system-prompt.ts`** — `buildSystemPrompt(): string` (SYNC). Reads this
  skill's `SKILL.md` + `templates/feasibility-report.md` + the document index
  + 10 critical rules and concatenates them into the agent system prompt.
- **`tools.ts`** — `agentTools`: `{ readDocument, listDocuments,
  searchDocuments }`. Each built with `tool({ description, inputSchema,
  execute })` from `ai`. Export the whole object (not a `tool()` wrapper) so
  `streamText` receives a `ToolSet`.

## app/api/chat/route.ts — streaming POST handler

Canonical AI SDK v7 streaming chat route for this app:

```ts
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { opencodeGo, MODEL_ID } from "@/lib/ai-provider";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { agentTools } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: UIMessage[] };
  const system = buildSystemPrompt();
  const modelMessages = await convertToModelMessages(messages); // ASYNC — must await
  const result = streamText({
    model: opencodeGo.chatModel(MODEL_ID),
    system,
    messages: modelMessages,
    tools: agentTools,
    stopWhen: isStepCount(20),
    temperature: 0.2,
  });
  return createUIMessageStreamResponse({ stream: result.toUIMessageStream() });
}
```

### Key AI SDK v7 gotchas

1. **`convertToModelMessages` returns `Promise<ModelMessage[]>`** — it is NOT
   synchronous in v7. Passing the un-awaited promise as `messages:` fails
   type check with *"Type 'Promise<ModelMessage[]>' is missing the following
   properties from type 'ModelMessage[]'"*. Always `await` it into a local
   first.
2. **Don't import `toUIMessageStream` as a standalone** unless you use it as a
   function. The instance method `result.toUIMessageStream()` is what you call
   on the `streamText` result; importing the function and not using it trips
   unused-import lint.
3. **`opencodeGo.chatModel(MODEL_ID)`**, not `opencodeGo(MODEL_ID)`. The
   openai-compatible provider returns a `LanguageModelV4` via its
   `.chatModel()` method (see `@ai-sdk/openai-compatible` types:
   `OpenAICompatibleProvider.chatModel(modelId): LanguageModelV4`).
4. **`isStepCount(20)` is the `stopWhen` value** — AI SDK v7 changed
   `maxSteps` → `stopWhen: isStepCount(n)`. `isStepCount` is exported from
   `ai` and returns a `StopCondition`. Default for `streamText` is
   `isStepCount(20)` per the bundled `.d.ts`.
5. **`runtime = "nodejs"` is required**, not `"edge"` — `pdf-parse` and `fs`
  -based document reads need the Node runtime.
6. **`maxDuration = 300`** — 20 tool-calling steps reading multiple PDFs can
   take minutes; the default low bound will cut off mid-stream.

## lib/ai-provider.ts — OpenCode Go provider

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const opencodeGo = createOpenAICompatible({
  name: "opencode-go",
  baseURL: process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1",
  apiKey: process.env.OPENCODE_GO_API_KEY,
});

export const MODEL_ID = "glm-5.2";
```

> **Pitfall — `chatEndpoint` is NOT a valid setting** in
> `@ai-sdk/openai-compatible` v3+. The package auto-appends `/chat/completions`
> to `baseURL` when you call `chatModel()`, exactly as the file's own comment
> documents. Including `chatEndpoint: "/chat/completions"` fails
> `bun run build` type check with *"Object literal may only specify known
> properties, and 'chatEndpoint' does not exist in type
> 'OpenAICompatibleProviderSettings'"*. If a future dependency bump reintroduces
> a custom-endpoint option, check the installed `dist/index.d.ts`
> (`OpenAICompatibleProviderSettings`) — do not trust memory.

## Build verification

`bun run build` runs `next build` (Turbopack) and includes a full TypeScript
type check. After creating/modifying `app/api/chat/route.ts`, run the build
and confirm:
- `✓ Compiled successfully`
- `Finished TypeScript …` with no `Type error:` lines
- `/api/chat` listed as `ƒ (Dynamic)` in the route map (it's a POST route
  handler, so it's server-rendered on demand, not static)

A pre-existing type error anywhere in the project (e.g. the `chatEndpoint`
issue above) blocks the entire build even if your new file is correct — fix
the blocker, don't work around it.
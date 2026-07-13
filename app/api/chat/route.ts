import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";

import { ollamaCloud, MODEL_ID } from "@/lib/ai-provider";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { agentTools } from "@/lib/agent/tools";

/**
 * Streaming chat API route for the Ontario Land Use Planning
 * Feasibility Assessment Agent.
 *
 * The client posts a `UIMessage[]` array. We convert it to model messages,
 * build the agent's system prompt, and stream the agent's response back as a
 * UI message stream (SSE).
 *
 * Tools: readDocument, listDocuments, searchDocuments — the agent can call
 * them across up to 20 steps before being stopped, allowing it to read
 * planning documents and produce cited findings.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: UIMessage[] };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError(400, "messages must be a non-empty array of UIMessages");
  }

  // ai@7 UIMessages carry content in a `parts` array (not a `content` string).
  // convertToModelMessages throws a cryptic "Cannot read properties of
  // undefined (reading 'map')" when `parts` is missing — e.g. if a client
  // posts the legacy { role, content } shape. Guard up front with a clear 400.
  for (const m of messages) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant" && m.role !== "system") ||
      !Array.isArray(m.parts)
    ) {
      return jsonError(
        400,
        "each message must be a UIMessage with a `role` (user|assistant|system) and a `parts` array",
      );
    }
  }

  const system = buildSystemPrompt();

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: ollamaCloud.chatModel(MODEL_ID),
    system,
    messages: modelMessages,
    tools: agentTools,
    stopWhen: isStepCount(20),
    temperature: 0.2,
  });

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
  });
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
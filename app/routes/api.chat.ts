import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import type { ActionFunctionArgs } from "react-router";
import { apiAuthMiddleware } from "~/auth/middleware";
import { ollamaCloud, MODEL_ID } from "~/lib/ai-provider";
import { buildSystemPrompt } from "~/lib/agent/system-prompt";
import { agentTools } from "~/lib/agent/tools";

/**
 * Streaming chat API resource route for the Ontario Land Use Planning
 * Feasibility Assessment Agent.
 *
 * The client posts a UIMessage[] array. We convert it to model messages,
 * build the agent's system prompt, and stream the agent's response back as a
 * UI message stream (SSE).
 *
 * Auth is enforced by apiAuthMiddleware (v8 middleware).
 */

export const middleware = [apiAuthMiddleware];

export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json()) as { messages?: UIMessage[] };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError(400, "messages must be a non-empty array of UIMessages");
  }

  // Validate UIMessage shape
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
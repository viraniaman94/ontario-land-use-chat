import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuthMiddleware } from "~/auth/middleware";
import { createConversation, listConversations } from "~/db/client";

/**
 * GET  /api/conversations — list all conversations
 * POST /api/conversations — create a new conversation
 *
 * Auth is enforced by apiAuthMiddleware (v8 middleware).
 */

export const middleware = [apiAuthMiddleware];

export async function loader(_args: LoaderFunctionArgs) {
  const conversations = await listConversations();
  return new Response(JSON.stringify({ conversations }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json()) as { id?: string; title?: string };

  if (!body.id) {
    return jsonError(400, "id is required");
  }

  const conv = await createConversation(body.id, body.title || "New assessment");
  return new Response(JSON.stringify({ conversation: conv }), {
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
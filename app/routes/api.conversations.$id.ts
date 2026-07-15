import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { apiAuthMiddleware } from "~/auth/middleware";
import {
  deleteConversation,
  getConversation,
  getMessages,
  replaceMessages,
  updateConversationTitle,
} from "~/db/client";

/**
 * GET    /api/conversations/:id — get conversation with all messages
 * PUT    /api/conversations/:id — update title and/or replace all messages
 * DELETE /api/conversations/:id — delete conversation and all its messages
 *
 * Auth is enforced by apiAuthMiddleware (v8 middleware).
 */

export const middleware = [apiAuthMiddleware];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) return jsonError(400, "id is required");

  const conv = await getConversation(id);
  if (!conv) return jsonError(404, "Conversation not found");

  const messages = await getMessages(id);

  return new Response(
    JSON.stringify({
      conversation: conv,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export async function action({ params, request }: ActionFunctionArgs) {
  const id = params.id;
  if (!id) return jsonError(400, "id is required");

  const method = request.method;

  if (method === "DELETE") {
    await deleteConversation(id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (method === "PUT" || method === "PATCH") {
    const body = (await request.json()) as {
      title?: string;
      messages?: Array<{ id: string; role: string; parts: unknown[] }>;
    };

    if (body.title !== undefined) {
      await updateConversationTitle(id, body.title);
    }

    if (body.messages !== undefined) {
      await replaceMessages(id, body.messages);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return jsonError(405, "Method not allowed");
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
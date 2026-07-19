import { useCallback, useMemo, useRef, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { authMiddleware } from "~/auth/middleware";
import { ensureSchema, listConversations, type ConversationRow } from "~/db/client";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { ChatNavContext, type ChatNavContextValue } from "~/lib/chat-nav-context";
import type { UIMessage } from "ai";

/**
 * Pathless layout route that guards all authenticated pages via v8 middleware
 * and renders the shared chat shell (sidebar + outlet). Each conversation is
 * addressable at `/c/<conversationId>`, so `activeId` is derived from the URL
 * rather than held in component state — making chats bookmarkable and
 * refreshable independently.
 */

export const middleware = [authMiddleware];

export async function loader(_args: LoaderFunctionArgs) {
  // Ensure DB tables exist (idempotent — runs once per server lifetime), then
  // load the conversation list once for all child routes.
  await ensureSchema();
  const conversations = await listConversations();
  return { conversations };
}

/** Parse `/c/<id>` from the pathname to derive the active conversation. */
function deriveActiveId(pathname: string): string | null {
  const m = pathname.match(/^\/c\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function AuthLayout() {
  const { conversations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();

  const [list, setList] = useState<ConversationRow[]>(conversations);
  const activeId = useMemo(
    () => deriveActiveId(location.pathname),
    [location.pathname],
  );

  // Track which conversations actually exist in the DB. New "assessment"
  // clicks are created locally only; they get persisted to the DB lazily once
  // the user sends their first message. This avoids saving empty assessments.
  const [persistedIds, setPersistedIds] = useState<Set<string>>(
    () => new Set(conversations.map((c) => c.id)),
  );
  const persistedIdsRef = useRef(persistedIds);
  persistedIdsRef.current = persistedIds;

  const onNew = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const now = new Date().toISOString();
    const conv: ConversationRow = {
      id,
      title: "New assessment",
      created_at: now,
      updated_at: now,
    };

    // Optimistic update: show it locally as the active chat, but do NOT
    // persist to the DB yet. It will be created lazily on the first message.
    setList((prev) => [conv, ...prev]);
    navigate(`/c/${id}`);
  }, [navigate]);

  const onSelect = useCallback(
    (id: string) => {
      navigate(`/c/${id}`);
    },
    [navigate],
  );

  const onDelete = useCallback(
    async (id: string) => {
      // Optimistic update
      setList((prev) => prev.filter((c) => c.id !== id));
      setPersistedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeId === id) {
        navigate("/");
      }

      // Persist to DB
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeId, navigate],
  );

  const onPersist = useCallback(
    async (id: string, messages: UIMessage[]) => {
      // Never persist an assessment with no user message — empty "New
      // assessment" chats should not be saved to the DB or shown in the
      // sidebar once the user navigates away.
      const firstUser = messages.find((m) => m.role === "user");
      if (!firstUser) {
        console.warn("[persist] onPersist called but no user message found", {
          id,
          messageCount: messages.length,
          roles: messages.map((m) => m.role),
        });
        return;
      }

      console.log("[persist] onPersist called", {
        id,
        messageCount: messages.length,
      });

      let title = "New assessment";
      const text = (firstUser.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join(" ")
        .trim();
      if (text) {
        title = text.length > 60 ? text.slice(0, 60) + "…" : text;
      }

      // Optimistic update of local list
      setList((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, title, updated_at: new Date().toISOString() }
            : c,
        ),
      );

      try {
        // Lazily create the conversation row the first time a message is
        // sent (onNew no longer creates it up front).
        if (!persistedIdsRef.current.has(id)) {
          const createRes = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, title }),
          });
          if (!createRes.ok) {
            const errText = await createRes.text();
            console.error(
              `[persist] POST /api/conversations failed: ${createRes.status} ${errText}`,
            );
          }
          setPersistedIds((prev) => new Set(prev).add(id));
        }

        // Persist messages to DB
        const putRes = await fetch(`/api/conversations/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
          }),
        });
        if (!putRes.ok) {
          const errText = await putRes.text();
          console.error(
            `[persist] PUT /api/conversations/${id} failed: ${putRes.status} ${errText}`,
          );
        }
      } catch (err) {
        console.error("Failed to persist messages:", err);
      }
    },
    [],
  );

  // Keep list sorted by updated_at desc
  const sortedList = useMemo(
    () =>
      [...list].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [list],
  );

  // Only show conversations that actually exist in the DB, plus the currently
  // active one. This keeps empty, never-messaged "New assessment" drafts from
  // lingering in the sidebar once the user navigates away.
  const visibleList = useMemo(
    () =>
      sortedList.filter((c) => persistedIds.has(c.id) || c.id === activeId),
    [sortedList, persistedIds, activeId],
  );

  const ctx = useMemo<ChatNavContextValue>(
    () => ({
      list: visibleList,
      persistedIds,
      activeId,
      onNew,
      onSelect,
      onDelete,
      onPersist,
    }),
    [visibleList, persistedIds, activeId, onNew, onSelect, onDelete, onPersist],
  );

  return (
    <ChatNavContext.Provider value={ctx}>
      <SidebarProvider>
        <ChatSidebar
          conversations={visibleList.map((c) => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: new Date(c.updated_at).getTime(),
          }))}
          activeId={activeId}
          onSelect={onSelect}
          onNew={onNew}
          onDelete={onDelete}
        />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-1 px-3 py-2 md:hidden">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-1 h-4" />
              <span className="text-xs text-muted-foreground">
                Ontario Land Use Planning Agent
              </span>
            </div>
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavContext.Provider>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { ChatSidebar } from "~/components/chat/chat-sidebar";
import { Chat } from "~/components/chat/chat";
import type { UIMessage } from "ai";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
  listConversations,
  type ConversationRow,
} from "~/db/client";

export const meta: MetaFunction = () => [
  { title: "Ontario Land Use Planning Agent" },
  {
    name: "description",
    content:
      "AI-powered feasibility assessment for Ontario development projects.",
  },
];

export async function loader(_args: LoaderFunctionArgs) {
  // Auth is enforced by the parent _auth.tsx middleware (v8)
  const conversations = await listConversations();
  return { conversations };
}

export default function Home() {
  const loaderData = useLoaderData<typeof loader>();
  const [list, setList] = useState<ConversationRow[]>(loaderData.conversations);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Select the most recent conversation on first load
  useEffect(() => {
    if (activeId === null && list.length > 0) {
      setActiveId(list[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNew = useCallback(async () => {
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

    // Optimistic update
    setList((prev) => [conv, ...prev]);
    setActiveId(id);

    // Persist to DB
    try {
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: "New assessment" }),
      });
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      // Optimistic update
      setList((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }

      // Persist to DB
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeId],
  );

  const handlePersist = useCallback(
    async (id: string, messages: UIMessage[]) => {
      // Update title from first user message
      const firstUser = messages.find((m) => m.role === "user");
      let title = "New assessment";
      if (firstUser) {
        const text = (firstUser.parts ?? [])
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join(" ")
          .trim();
        if (text) {
          title = text.length > 60 ? text.slice(0, 60) + "…" : text;
        }
      }

      // Optimistic update of local list
      setList((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, title, updated_at: new Date().toISOString() }
            : c,
        ),
      );

      // Persist messages to DB
      try {
        await fetch(`/api/conversations/${id}`, {
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
      } catch (err) {
        console.error("Failed to persist messages:", err);
      }
    },
    [],
  );

  // Keep list sorted by updated_at desc
  const sortedList = [...list].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <SidebarProvider>
      <ChatSidebar
        conversations={sortedList.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: new Date(c.created_at).getTime(),
          updatedAt: new Date(c.updated_at).getTime(),
        }))}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
      />
      <SidebarInset>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-1 px-3 py-2 md:hidden">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <span className="text-xs text-muted-foreground">
              Ontario Land Use Planning Agent
            </span>
          </div>
          {activeId ? (
            <Chat
              key={activeId}
              id={activeId}
              onPersist={handlePersist}
            />
          ) : (
            <NewChatPlaceholder onStart={handleNew} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NewChatPlaceholder({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
        ON
      </div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Ontario Land Use Planning Feasibility Agent
      </h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        Assess whether a proposed development is feasible under provincial
        policy, official plans, and zoning by-laws — across 41 planning
        documents covering a 150km radius of Peterborough, Ontario.
      </p>
      <button
        onClick={onStart}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Start a new assessment
      </button>
      <p className="mt-6 max-w-sm text-xs text-muted-foreground">
        A registered professional planner (RPP) should review any findings
        before relying on them. This tool provides a preliminary assessment
        only.
      </p>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Chat } from "@/components/chat/chat";
import { useConversations } from "@/hooks/use-conversations";
import type { UIMessage } from "ai";

export default function Home() {
  const {
    list,
    create,
    remove,
    persist,
    getMessages,
    hydrated,
  } = useConversations();

  const [activeId, setActiveId] = useState<string | null>(null);

  // On first hydration: select the most recent conversation, or none.
  // We don't auto-create so the user starts with a clean empty state.
  useEffect(() => {
    if (hydrated && activeId === null && list.length > 0) {
      setActiveId(list[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const handleNew = useCallback(() => {
    const id = create();
    setActiveId(id);
  }, [create]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      remove(id);
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [remove, activeId],
  );

  const handlePersist = useCallback(
    (id: string, messages: UIMessage[]) => {
      persist(id, messages);
    },
    [persist],
  );

  const initialMessages = activeId ? getMessages(activeId) : [];

  return (
    <SidebarProvider>
      <ChatSidebar
        conversations={list}
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
              initialMessages={initialMessages}
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
"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "./chat-message";
import type { UIMessage } from "ai";

interface ChatMessagesProps {
  messages: UIMessage[];
  status: string;
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 text-base"
      aria-busy={status === "streaming"}
    >
      {messages.length === 0 && (
        <div className="mx-auto my-auto max-w-md text-center text-muted-foreground">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Start a Feasibility Assessment
          </h2>
          <p className="text-sm">
            Describe your proposed development project — include the
            site location, municipality, proposed land use, and project
            scale. The agent will analyze it against provincial policy,
            official plans, and zoning by-laws.
          </p>
        </div>
      )}
      {messages.map((message, index) => {
        const text = message.parts
          ?.filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("") ?? "";

        const isStreaming =
          status === "streaming" &&
          index === messages.length - 1 &&
          message.role === "assistant";

        return (
          <ChatMessage
            key={message.id}
            role={message.role as "user" | "assistant"}
            content={text}
            isStreaming={isStreaming}
          />
        );
      })}
    </div>
  );
}
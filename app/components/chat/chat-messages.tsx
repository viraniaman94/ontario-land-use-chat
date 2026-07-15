
import { useEffect, useRef } from "react";
import { ChatMessage } from "./chat-message";
import { AssistantMessage } from "./assistant-message";
import type { UIMessage } from "ai";

interface ChatMessagesProps {
  messages: UIMessage[];
  status: string;
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives or status changes.
  // Only auto-scroll if the user is near the bottom, so we don't fight
  // manual scroll-back to read earlier content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-6"
      aria-busy={status === "streaming" || status === "submitted"}
    >
      {messages.length === 0 && status !== "submitted" && (
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
          <p className="mt-3 text-xs">
            <code className="rounded bg-muted px-1.5 py-0.5">Enter</code> to
            send · <code className="rounded bg-muted px-1.5 py-0.5">Shift+Enter</code>{" "}
            for a new line
          </p>
        </div>
      )}
      {status === "submitted" &&
        messages.length > 0 &&
        messages[messages.length - 1].role === "user" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              Analyzing documents…
            </div>
          </div>
        )}
      {messages.map((message, index) => {
        const isActive =
          (status === "streaming" || status === "submitted") &&
          index === messages.length - 1;
        const isStreaming = isActive && message.role === "assistant";

        if (message.role === "assistant") {
          return (
            <AssistantMessage
              key={message.id}
              message={message}
              isStreaming={isStreaming}
            />
          );
        }

        // User messages: extract text parts
        const text = message.parts
          ?.filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("") ?? "";

        return (
          <ChatMessage
            key={message.id}
            role={message.role as "user" | "assistant"}
            content={text}
            isStreaming={false}
          />
        );
      })}
    </div>
  );
}

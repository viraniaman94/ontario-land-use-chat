
import { Bubble } from "@/components/ui/bubble";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/**
 * ChatMessage — now used for user messages only.
 * Assistant messages are rendered by AssistantMessage.
 */
export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <Bubble
        variant={isUser ? "sent" : "received"}
        className={cn("max-w-[85%]", !isUser && "w-full")}
      >
        <div className="whitespace-pre-wrap">{content}</div>
        {isStreaming && !isUser && (
          <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current align-middle" />
        )}
      </Bubble>
    </div>
  );
}

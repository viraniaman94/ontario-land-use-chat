import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

interface ChatProps {
  id: string;
  onPersist: (id: string, messages: UIMessage[]) => void;
}

export function Chat({ id, onPersist }: ChatProps) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );

  // Load existing messages from the DB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.messages && data.messages.length > 0) {
            setInitialMessages(data.messages as UIMessage[]);
          } else if (!cancelled) {
            setInitialMessages([]);
          }
        } else if (!cancelled) {
          setInitialMessages([]);
        }
      } catch {
        if (!cancelled) setInitialMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Show a loading state while fetching initial messages
  if (initialMessages === null) {
    return (
      <div className="flex h-svh w-full flex-col">
        <ChatHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </div>
    );
  }

  return <ChatInner key={id} id={id} initialMessages={initialMessages} onPersist={onPersist} />;
}

const ChatInner = memo(function ChatInner({
  id,
  initialMessages,
  onPersist,
}: {
  id: string;
  initialMessages: UIMessage[];
  onPersist: (id: string, messages: UIMessage[]) => void;
}) {
  // Memoize transport so it doesn't create a new instance on every render
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  // Persist via the onFinish callback — fires directly from the Chat
  // instance when the assistant response stream completes, which is more
  // reliable than a useEffect that depends on React's render timing.
  // Opening an existing conversation never triggers onFinish, so we avoid
  // the stale-baseline problem that plagued the effect approach.
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
    onFinish: (result) => {
      // Persist after every completed (or errored) response, but skip
      // aborts (user pressed Stop) to avoid saving incomplete responses.
      if (!result.isAbort) {
        onPersistRef.current(id, result.messages);
      }
    },
  });

  const isReady = status === "ready" || status === "error";
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-svh w-full flex-col">
      <ChatHeader />
      <ChatMessages messages={messages} status={status} />
      <ChatInput
        onSend={(text) => {
          void sendMessage({ text });
        }}
        onStop={isStreaming ? () => stop() : undefined}
        disabled={!isReady}
        isStreaming={isStreaming}
      />
    </div>
  );
});
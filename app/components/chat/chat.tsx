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

  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
  });

  // Persist conversation to DB ONLY when the messages have actually changed
  // (e.g. after a streaming round completes) — never on mount just from
  // loading an existing conversation. We do this by tracking a signature of
  // the messages: on the first run we capture the loaded state as the
  // baseline, and only call onPersist when the signature differs from the
  // last one we persisted. This is what keeps clicking an older chat from
  // bumping its updated_at and jumping it to the top of the sidebar.
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  // Initialise the signature to the loaded messages' signature so that:
  //  • Opening an existing conversation does NOT re-persist on mount
  //    (the initial sig matches the messages sig → effect skips).
  //  • A brand-new (empty) conversation has an initial sig of "", which
  //    never matches any non-empty messages sig → the first persist fires.
  const lastSigRef = useRef<string>(
    initialMessages
      .map((m) => `${m.id}:${m.role}:${JSON.stringify(m.parts)}`)
      .join("||"),
  );
  useEffect(() => {
    if (messages.length === 0 || status !== "ready") return;
    const sig = messages
      .map((m) => `${m.id}:${m.role}:${JSON.stringify(m.parts)}`)
      .join("||");
    if (sig === lastSigRef.current) return; // nothing changed since last persist
    lastSigRef.current = sig;
    onPersistRef.current(id, messages);
  }, [id, messages, status]);

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
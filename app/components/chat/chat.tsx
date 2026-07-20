import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChatHeader } from "./chat-header";
import { StreamStatusBar } from "./stream-status-bar";
import { useStreamStatus } from "@/hooks/use-stream-status";
import { AssistantMessage } from "./assistant-message";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { InputGroupAddon } from "@/components/ui/input-group";

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
      <div className="flex h-svh w-full min-w-0 flex-col">
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

  const { messages, sendMessage, status, error, stop } = useChat({
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

  const streamStatus = useStreamStatus({
    chatStatus: status,
    error,
    messages,
  });

  const [input, setInput] = useState("");

  return (
    <div className="flex h-svh w-full min-w-0 flex-col">
      <ChatHeader />
      <Conversation>
        <ConversationContent className="gap-4 p-6">
          {messages.length === 0 && status !== "submitted" && (
            <ConversationEmptyState>
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
            </ConversationEmptyState>
          )}
          {status === "submitted" &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <Message from="assistant">
                <MessageContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                    Analyzing documents…
                  </div>
                </MessageContent>
              </Message>
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
            const text =
              message.parts
                ?.filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("") ?? "";

            return (
              <Message key={message.id} from="user">
                <MessageContent>
                  <div className="whitespace-pre-wrap">{text}</div>
                </MessageContent>
              </Message>
            );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <StreamStatusBar info={streamStatus} />
      <PromptInput
        className="border-t bg-background p-4"
        onSubmit={(msg) => {
          const text = msg.text.trim();
          if (!text) return;
          streamStatus.markSend();
          void sendMessage({ text });
        }}
      >
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your project: location, municipality, proposed use, scale..."
          className="min-h-[80px] px-3"
        />
        <InputGroupAddon
          align="inline-end"
          className="self-stretch pl-2 pr-2 py-1"
        >
          <PromptInputSubmit
            status={status}
            disabled={!input.trim() && !streamStatus.inFlight}
            onStop={
              streamStatus.inFlight
                ? () => {
                    streamStatus.markStop();
                    stop();
                  }
                : undefined
            }
            className="h-full rounded-md"
          />
        </InputGroupAddon>
      </PromptInput>
      <p className="px-4 pb-3 text-center text-xs text-muted-foreground">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
});
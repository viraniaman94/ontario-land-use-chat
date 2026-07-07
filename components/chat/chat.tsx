"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

interface ChatProps {
  id: string;
  initialMessages?: UIMessage[];
  onPersist: (id: string, messages: UIMessage[]) => void;
}

export function Chat({ id, initialMessages, onPersist }: ChatProps) {
  const { messages, sendMessage, status, stop } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // Persist conversation to localStorage whenever messages change.
  // Skip the empty initial state so we don't overwrite a title unnecessarily.
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;
  useEffect(() => {
    if (messages.length > 0) {
      onPersistRef.current(id, messages);
    }
  }, [id, messages]);

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
}
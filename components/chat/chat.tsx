"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  return (
    <div className="flex h-svh w-full flex-col">
      <ChatHeader />
      <ChatMessages messages={messages} status={status} />
      <ChatInput
        onSend={(text) => {
          void sendMessage({ text });
        }}
        disabled={status !== "ready"}
      />
    </div>
  );
}
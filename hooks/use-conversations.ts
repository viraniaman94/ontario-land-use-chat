"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";

const STORAGE_KEY = "ontario-land-use-chats:v1";
const MESSAGE_STORAGE_KEY = (id: string) => `ontario-land-use-chat:${id}`;

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationStored extends ConversationMeta {
  messages: UIMessage[];
}

function readStore(): Record<string, ConversationStored> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ConversationStored>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ConversationStored>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function titleFromMessages(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New assessment";
  const text = (firstUser.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
  if (!text) return "New assessment";
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}

export function useConversations() {
  const [store, setStore] = useState<Record<string, ConversationStored>>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setStore(readStore());
    setHydrated(true);
  }, []);

  const list = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);

  const create = useCallback((): string => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const conv: ConversationStored = {
      id,
      title: "New assessment",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setStore((prev) => {
      const next = { ...prev, [id]: conv };
      writeStore(next);
      return next;
    });
    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setStore((prev) => {
      const next = { ...prev };
      delete next[id];
      writeStore(next);
      return next;
    });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(MESSAGE_STORAGE_KEY(id));
    }
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setStore((prev) => {
      const conv = prev[id];
      if (!conv) return prev;
      const next = {
        ...prev,
        [id]: { ...conv, title, updatedAt: Date.now() },
      };
      writeStore(next);
      return next;
    });
  }, []);

  const persist = useCallback((id: string, messages: UIMessage[]) => {
    setStore((prev) => {
      const existing = prev[id];
      const now = Date.now();
      const title = titleFromMessages(messages);
      const conv: ConversationStored = existing
        ? { ...existing, messages, title, updatedAt: now }
        : {
            id,
            title,
            createdAt: now,
            updatedAt: now,
            messages,
          };
      const next = { ...prev, [id]: conv };
      writeStore(next);
      return next;
    });
  }, []);

  const getMessages = useCallback((id: string): UIMessage[] => {
    return store[id]?.messages ?? [];
  }, [store]);

  return { list, create, remove, rename, persist, getMessages, hydrated };
}
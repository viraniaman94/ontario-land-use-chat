import { createContext, useContext } from "react";
import type { UIMessage } from "ai";
import type { ConversationRow } from "~/db/client";

/**
 * Shared navigation + conversation state for the authenticated chat shell.
 *
 * The `_auth.tsx` layout owns this state (sidebar list, persistence, URL
 * navigation) and provides it to child routes (`_auth._index.tsx` and
 * `_auth.c.$conversationId.tsx`) so each chat has a unique, bookmarkable URL
 * while still sharing one sidebar.
 */
export interface ChatNavContextValue {
  /** All known conversations (persisted + active draft), sorted newest-first. */
  list: ConversationRow[];
  /** IDs that have been written to the DB. Drafts (no user message) are not. */
  persistedIds: Set<string>;
  /** The conversation id derived from the current URL (`/c/<id>`), or null. */
  activeId: string | null;
  /** Start a new assessment: mints an id and navigates to `/c/<id>`. */
  onNew: () => void;
  /** Navigate to an existing conversation. */
  onSelect: (id: string) => void;
  /** Delete a conversation (optimistic + DB) and navigate away if active. */
  onDelete: (id: string) => void;
  /** Persist messages for a conversation (lazy-create + PUT). */
  onPersist: (id: string, messages: UIMessage[]) => void;
}

export const ChatNavContext = createContext<ChatNavContextValue | null>(null);

/**
 * Access the shared chat navigation context. Must be rendered inside the
 * `_auth.tsx` layout.
 */
export function useChatNav(): ChatNavContextValue {
  const ctx = useContext(ChatNavContext);
  if (!ctx) {
    throw new Error("useChatNav must be used within the AuthLayout (_auth.tsx)");
  }
  return ctx;
}
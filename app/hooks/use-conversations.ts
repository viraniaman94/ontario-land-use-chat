/**
 * Conversation metadata type (used by ChatSidebar).
 * Conversation CRUD logic now lives in the _auth._index route component
 * and the /api/conversations API routes (backed by Neon Postgres).
 */
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Neon Postgres database client.
 *
 * Uses @neondatabase/serverless which communicates with Neon over HTTP,
 * making it ideal for serverless / edge runtimes. The connection string
 * is read from the DATABASE_URL env var.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Set it in your .env file with your Neon connection string.",
  );
}

export const sql = neon(connectionString);

/**
 * Ensure the database schema exists. Call this on server startup.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
let schemaInitialized = false;

export async function ensureSchema(): Promise<void> {
  if (schemaInitialized) return;

  let schemaSql: string;
  try {
    schemaSql = readFileSync(join(process.cwd(), "app/db/schema.sql"), "utf-8");
  } catch {
    // Fallback: inline schema in case the file isn't found
    schemaSql = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New assessment',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        parts JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
    `;
  }

  // Neon's HTTP driver expects tagged template calls.
  // Split the schema into individual statements and execute each.
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await sql.query(stmt);
  }
  schemaInitialized = true;
}

// ── Types ──────────────────────────────────────────────

export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  parts: unknown[];
  created_at: string;
}

// ── Conversation queries ───────────────────────────────

export async function listConversations(): Promise<ConversationRow[]> {
  return (await sql`
    SELECT id, title, created_at, updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `) as ConversationRow[];
}

export async function getConversation(
  id: string,
): Promise<ConversationRow | null> {
  const rows = (await sql`
    SELECT id, title, created_at, updated_at
    FROM conversations
    WHERE id = ${id}
  `) as ConversationRow[];
  return rows[0] ?? null;
}

export async function createConversation(
  id: string,
  title: string = "New assessment",
): Promise<ConversationRow> {
  const rows = (await sql`
    INSERT INTO conversations (id, title)
    VALUES (${id}, ${title})
    RETURNING id, title, created_at, updated_at
  `) as ConversationRow[];
  return rows[0];
}

export async function deleteConversation(id: string): Promise<void> {
  await sql`DELETE FROM conversations WHERE id = ${id}`;
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await sql`
    UPDATE conversations SET title = ${title}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

// ── Message queries ────────────────────────────────────

export async function getMessages(
  conversationId: string,
): Promise<MessageRow[]> {
  return (await sql`
    SELECT id, conversation_id, role, parts, created_at
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC, id ASC
  `) as MessageRow[];
}

/**
 * Replace all messages for a conversation.
 * Deletes existing messages and inserts the full new set.
 * Uses ON CONFLICT to upsert, so partial failures self-heal.
 */
export async function replaceMessages(
  conversationId: string,
  messages: Array<{ id: string; role: string; parts: unknown[] }>,
): Promise<void> {
  // Delete existing messages for this conversation
  await sql`DELETE FROM messages WHERE conversation_id = ${conversationId}`;

  // Insert all new messages
  for (const msg of messages) {
    await sql`
      INSERT INTO messages (id, conversation_id, role, parts)
      VALUES (${msg.id}, ${conversationId}, ${msg.role}, ${JSON.stringify(msg.parts)}::jsonb)
    `;
  }

  // Update conversation timestamp
  await sql`
    UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}
  `;
}

/**
 * Upsert a single message (insert or update if it already exists).
 */
export async function upsertMessage(
  conversationId: string,
  message: { id: string; role: string; parts: unknown[] },
): Promise<void> {
  await sql`
    INSERT INTO messages (id, conversation_id, role, parts)
    VALUES (${message.id}, ${conversationId}, ${message.role}, ${JSON.stringify(message.parts)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      parts = EXCLUDED.parts
  `;
}
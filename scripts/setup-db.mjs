#!/usr/bin/env node
/**
 * DB setup script — creates the conversations and messages tables in Neon.
 * Run with: bun run db:setup
 *
 * Reads DATABASE_URL from .env (via --env-file) or environment.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const sql = neon(connectionString);

const schemaSql = readFileSync(new URL("../app/db/schema.sql", import.meta.url), "utf-8");

// Split into individual statements and execute each via sql.query()
const statements = schemaSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`📊 Creating database schema in Neon (${statements.length} statements)...`);

for (const stmt of statements) {
  try {
    await sql.query(stmt);
    // Show first line of each statement for progress
    const preview = stmt.split("\n")[0].trim().slice(0, 60);
    console.log(`  ✓ ${preview}...`);
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

console.log("✅ Schema created successfully!");
console.log("   Tables: conversations, messages");
console.log("   Indexes: idx_messages_conversation_id, idx_conversations_updated_at");
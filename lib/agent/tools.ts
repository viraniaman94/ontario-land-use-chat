import { tool } from "ai";
import { z } from "zod";
import {
  readDocument,
  listDocuments,
  searchDocuments,
} from "./document-service";

/**
 * readDocument: Read a planning document or section file by its relative path.
 *
 * Documents are stored as .md files. Large documents have been split into
 * individual section files in per-document subdirectories. The agent should:
 *   1. Call listDocuments() to get the top-level sections index.
 *   2. Read a document's `_index.md` to see all available sections.
 *   3. Read individual section files as needed.
 */
const readDocumentTool = tool({
  description:
    "Read a planning document or individual section file by its relative path within the documents directory. All documents are .md files. Large documents have been split into section files in subdirectories — read the document's `_index.md` first to see available sections. Returns content truncated to 50,000 characters. Use listDocuments to find available document paths.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "Relative path to the document or section file (e.g., 'provincial/pps-2024/_index.md' for the section index, or 'provincial/pps-2024/02-vision.md' for a specific section, or 'provincial/pps-2024.md' for the full document)",
      ),
  }),
  execute: async ({ path: docPath }) => {
    return readDocument(docPath);
  },
});

/**
 * listDocuments: Return the top-level sections navigation index.
 */
const listDocumentsTool = tool({
  description:
    "List all available planning documents with their section counts and index paths. Returns the top-level sections index — use this as your starting point to navigate the document knowledge base. Each document has a `_index.md` file listing its individual sections with 1-line summaries. Read a document's `_index.md` to find relevant section files before loading full sections.",
  inputSchema: z.object({}),
  execute: async () => {
    return listDocuments();
  },
});

/**
 * searchDocuments: Search across all document indexes for sections matching a query.
 */
const searchDocumentsTool = tool({
  description:
    "Search across all document section indexes for planning documents and sections matching a keyword query. All tokens in the query must appear in a matching line (case-insensitive AND search). Returns matching lines from the top-level index and per-document section indexes, with the source document noted. Use this to find relevant sections without loading full documents.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query — all tokens must appear in a matching line (e.g., 'Peterborough zoning residential' or 'Greenbelt plan agriculture')",
      ),
  }),
  execute: async ({ query }) => {
    return searchDocuments(query);
  },
});

/**
 * Exported tool set for use with streamText / generateText.
 */
export const agentTools = {
  readDocument: readDocumentTool,
  listDocuments: listDocumentsTool,
  searchDocuments: searchDocumentsTool,
};
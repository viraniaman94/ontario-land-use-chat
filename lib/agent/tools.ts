import { tool } from "ai";
import { z } from "zod";
import {
  readDocument,
  listDocuments,
  searchDocuments,
} from "./document-service";

/**
 * readDocument: Read a planning document by its relative path.
 * The path is relative to the documents directory within the skill.
 */
const readDocumentTool = tool({
  description:
    "Read a planning document by its relative path within the documents directory. Supports PDF and HTML files. Returns the document text content (truncated to 50,000 characters for large documents). Use listDocuments first to find available document paths.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "Relative path to the document within the documents directory (e.g., 'provincial/pps-2024.pdf' or 'zoning/peterborough-zbl-sec01.pdf')",
      ),
  }),
  execute: async ({ path: docPath }) => {
    return readDocument(docPath);
  },
});

/**
 * listDocuments: List all available planning documents.
 */
const listDocumentsTool = tool({
  description:
    "List all available planning documents in the knowledge base. Returns the full document index showing every planning document available for assessment, organized by tier (provincial, upper-tier, single-tier, lower-tier, zoning).",
  inputSchema: z.object({}),
  execute: async () => {
    return listDocuments();
  },
});

/**
 * searchDocuments: Search the document index for documents matching a query.
 */
const searchDocumentsTool = tool({
  description:
    "Search the document index for planning documents matching a keyword query. All tokens in the query must appear in a line for it to match (case-insensitive AND search). Returns matching lines from the document index.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query — all tokens must appear in a matching line (e.g., 'Peterborough zoning' or 'Greenbelt plan')",
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
import { homedir } from "os";
import path from "path";
import { readFileSync, existsSync, readdirSync } from "fs";

const SKILL_DIR = path.join(
  homedir(),
  ".hermes/skills/ontario-land-use-feasibility",
);
const DOCS_DIR = path.join(SKILL_DIR, "documents");

const MAX_CHARS = 50_000;
const TRUNCATION_MESSAGE = "\n\n[... document truncated ...]";

// In-memory cache: relPath -> content
const docCache = new Map<string, string>();

/**
 * Resolve a relative document path against the documents directory,
 * with path traversal protection. Throws if the resolved path escapes root.
 */
function resolveSafe(relPath: string): string {
  const root = DOCS_DIR;
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal detected: "${relPath}" resolves outside the documents directory.`,
    );
  }
  return resolved;
}

/**
 * Read a document by its relative path within the documents directory.
 *
 * All planning documents are stored as .md files (converted from PDFs via
 * Marker). Large documents have been split into individual section files
 * in per-document subdirectories — see `sections-index.md` for the top-level
 * navigation index, and each document's `_index.md` for its section listing.
 *
 * Results are cached and truncated to 50K characters.
 */
export async function readDocument(relPath: string): Promise<string> {
  const cached = docCache.get(relPath);
  if (cached) return cached;

  const fullPath = resolveSafe(relPath);

  if (!existsSync(fullPath)) {
    throw new Error(
      `Document not found: "${relPath}" (resolved to ${fullPath})`,
    );
  }

  let content = readFileSync(fullPath, "utf-8");

  // Truncate if needed
  if (content.length > MAX_CHARS) {
    content = content.slice(0, MAX_CHARS) + TRUNCATION_MESSAGE;
  }

  docCache.set(relPath, content);
  return content;
}

/**
 * Return the top-level sections index, which lists every document
 * and its per-document section index. This is the agent's starting
 * point for navigating the document knowledge base.
 */
export function listDocuments(): string {
  const indexPath = path.join(DOCS_DIR, "sections-index.md");
  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8");
  }
  // Fallback: old document-index.md if sections-index hasn't been generated
  const oldIndex = path.join(DOCS_DIR, "document-index.md");
  if (existsSync(oldIndex)) {
    return readFileSync(oldIndex, "utf-8");
  }
  return "No document index found. Run `scripts/split_markdown.py` to generate it.";
}

/**
 * Search the document indexes for lines matching all query tokens
 * (case-insensitive AND search).
 *
 * Searches across the top-level sections index AND all per-document
 * _index.md files, so the agent can find relevant sections by keyword
 * without loading full documents.
 */
export function searchDocuments(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return listDocuments();
  }

  const results: string[] = [];

  // Search the top-level sections index
  const topIndex = listDocuments();
  for (const line of topIndex.split("\n")) {
    if (tokens.every((token) => line.toLowerCase().includes(token))) {
      results.push(line);
    }
  }

  // Search all per-document _index.md files
  const categories = ["provincial", "upper-tier", "single-tier", "zoning"];
  for (const cat of categories) {
    const catDir = path.join(DOCS_DIR, cat);
    if (!existsSync(catDir)) continue;

    // Walk subdirectories
    for (const subDir of readdirSync(catDir, { withFileTypes: true })) {
      if (!subDir.isDirectory()) continue;
      const indexFile = path.join(catDir, subDir.name, "_index.md");
      if (!existsSync(indexFile)) continue;

      const indexContent = readFileSync(indexFile, "utf-8");
      const docName = subDir.name;
      for (const line of indexContent.split("\n")) {
        if (tokens.every((token) => line.toLowerCase().includes(token))) {
          results.push(`[${cat}/${docName}] ${line}`);
        }
      }
    }
  }

  if (results.length === 0) {
    return `No documents or sections found matching: "${query}"`;
  }

  // Deduplicate and limit results
  const unique = [...new Set(results)];
  const limited = unique.slice(0, 200);

  if (unique.length > 200) {
    limited.push(`\n... and ${unique.length - 200} more results. Refine your query.`);
  }

  return limited.join("\n");
}

/**
 * Get the skill directory path.
 */
export function getSkillDir(): string {
  return SKILL_DIR;
}

/**
 * Get the documents directory path.
 */
export function getDocsDir(): string {
  return DOCS_DIR;
}
import { homedir } from "os";
import path from "path";
import { readFileSync } from "fs";

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
 * Resolve a relative document path to an absolute path within DOCS_DIR.
 * Throws if the resolved path escapes DOCS_DIR (path traversal protection).
 */
export function resolveDocPath(relPath: string): string {
  const resolved = path.resolve(DOCS_DIR, relPath);
  if (!resolved.startsWith(DOCS_DIR + path.sep) && resolved !== DOCS_DIR) {
    throw new Error(
      `Path traversal detected: "${relPath}" resolves outside the documents directory.`,
    );
  }
  return resolved;
}

/**
 * Read a document by its relative path within the documents directory.
 * Supports PDF (via pdf-parse), HTML, and Markdown/text files.
 * Results are cached and truncated to 50K characters.
 */
export async function readDocument(relPath: string): Promise<string> {
  const cached = docCache.get(relPath);
  if (cached) return cached;

  const absPath = resolveDocPath(relPath);
  const ext = path.extname(relPath).toLowerCase();

  let content: string;

  if (ext === ".pdf") {
    // Dynamic import so pdf-parse is only loaded when needed
    const { PDFParse } = await import("pdf-parse");
    const buffer = readFileSync(absPath);
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await pdf.getText();
    content = result.text;
  } else {
    // HTML, MD, TXT — read directly as UTF-8
    content = readFileSync(absPath, "utf-8");
  }

  // Truncate if needed
  if (content.length > MAX_CHARS) {
    content =
      content.slice(0, MAX_CHARS) + TRUNCATION_MESSAGE;
  }

  docCache.set(relPath, content);
  return content;
}

/**
 * Search the document index for lines matching all query tokens
 * (case-insensitive AND search).
 */
export function searchDocuments(query: string): string {
  const indexContent = listDocuments();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return indexContent;
  }

  const lines = indexContent.split("\n");
  const matching = lines.filter((line) =>
    tokens.every((token) => line.toLowerCase().includes(token)),
  );

  if (matching.length === 0) {
    return `No documents found matching: "${query}"`;
  }

  return matching.join("\n");
}

/**
 * Return the full document index content.
 */
export function listDocuments(): string {
  const indexPath = path.join(DOCS_DIR, "document-index.md");
  return readFileSync(indexPath, "utf-8");
}

/**
 * Get the skill directory path.
 */
export function getSkillDir(): string {
  return SKILL_DIR;
}
// ─── R2 / Filesystem dual-mode document service ─────────────────────────
//
// On Cloudflare Workers, documents are stored in an R2 bucket.
// On Node.js (local dev without the Cloudflare plugin), documents are
// read from the filesystem at ~/.hermes/skills/ontario-land-use-feasibility/
//
// The storage mode is determined by whether `setDocumentStorage()` has been
// called with an R2 bucket (done in workers/app.ts). When no R2 bucket is
// set, the service falls back to synchronous filesystem reads.

// -- R2 types (minimal, to avoid pulling in @cloudflare/workers-types) -----
interface R2ObjectBody {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}
interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes: string[];
  cursor?: string;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<R2Objects>;
}

// -- Filesystem imports (conditional) --------------------------------------
// We use a lazy dynamic import so that `fs` is only required when R2 is
// not available. On Workers, `fs` is not available, but these imports are
// only evaluated when the fallback path is taken.
let r2Bucket: R2Bucket | null = null;

/** Set the R2 bucket for document storage. Called from workers/app.ts. */
export function setDocumentStorage(bucket: unknown): void {
  r2Bucket = bucket as R2Bucket;
  // Clear caches when switching storage mode
  docCache.clear();
  searchIndexCache = null;
}

// -- Configuration ---------------------------------------------------------
const MAX_CHARS = 50_000;
const TRUNCATION_MESSAGE = "\n\n[... document truncated ...]";

// In-memory cache: relPath -> content
const docCache = new Map<string, string>();
let searchIndexCache: Map<string, string> | null = null;

// -- Filesystem helpers (only used in Node.js dev) -------------------------
// Use eval to prevent the bundler from statically analyzing these require
// calls. On Workers, these functions are NEVER called (R2 mode is used).
function nodeRequire(name: string): any {
  return (0, eval)("require")(name);
}

function getFs() {
  return nodeRequire("fs") as typeof import("fs");
}

function getPath() {
  return nodeRequire("path") as typeof import("path");
}

function getOs() {
  return nodeRequire("os") as typeof import("os");
}

function getDocsDir(): string {
  const os = getOs();
  const path = getPath();
  const skillDir = path.join(
    os.homedir(),
    ".hermes/skills/ontario-land-use-feasibility",
  );
  return process.env.LAND_USE_DOCS_DIR
    ? path.resolve(process.env.LAND_USE_DOCS_DIR)
    : path.join(skillDir, "documents");
}

function getSkillDir(): string {
  const os = getOs();
  const path = getPath();
  return path.join(os.homedir(), ".hermes/skills/ontario-land-use-feasibility");
}

function resolveSafe(relPath: string): string {
  const path = getPath();
  const root = getDocsDir();
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal detected: "${relPath}" resolves outside the documents directory.`,
    );
  }
  return resolved;
}

// -- Public API: read a document ------------------------------------------

/**
 * Read a document by its relative path.
 *
 * On Workers: reads from the R2 bucket (key = relPath, prefixed with `documents/`).
 * On Node.js: reads from the filesystem documents directory.
 *
 * Results are cached and truncated to 50K characters.
 */
export async function readDocument(relPath: string): Promise<string> {
  const cached = docCache.get(relPath);
  if (cached) return cached;

  let content: string;

  if (r2Bucket) {
    // R2 mode — keys are prefixed with `documents/`
    const key = relPath.startsWith("documents/") ? relPath : `documents/${relPath}`;
    const obj = await r2Bucket.get(key);
    if (!obj) {
      throw new Error(`Document not found: "${relPath}" (R2 key: ${key})`);
    }
    content = await obj.text();
  } else {
    // Filesystem mode (Node.js dev)
    const fs = getFs();
    const fullPath = resolveSafe(relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `Document not found: "${relPath}" (resolved to ${fullPath})`,
      );
    }
    content = fs.readFileSync(fullPath, "utf-8");
  }

  // Truncate if needed
  if (content.length > MAX_CHARS) {
    content = content.slice(0, MAX_CHARS) + TRUNCATION_MESSAGE;
  }

  docCache.set(relPath, content);
  return content;
}

// -- Public API: list documents -------------------------------------------

/**
 * Return the top-level sections index.
 */
export async function listDocuments(): Promise<string> {
  if (r2Bucket) {
    // Try sections-index.md, then fall back to document-index.md
    let obj = await r2Bucket.get("documents/sections-index.md");
    if (!obj) obj = await r2Bucket.get("documents/document-index.md");
    if (!obj) {
      return "No document index found. Upload documents to R2 first.";
    }
    return await obj.text();
  }

  // Filesystem mode
  const fs = getFs();
  const path = getPath();
  const docsDir = getDocsDir();
  const sectionsIndex = path.join(docsDir, "sections-index.md");
  if (fs.existsSync(sectionsIndex)) {
    return fs.readFileSync(sectionsIndex, "utf-8");
  }
  const oldIndex = path.join(docsDir, "document-index.md");
  if (fs.existsSync(oldIndex)) {
    return fs.readFileSync(oldIndex, "utf-8");
  }
  return "No document index found. Run `scripts/split_markdown.py` to generate it.";
}

// -- Public API: search documents -----------------------------------------

/**
 * Search the document indexes for lines matching all query tokens
 * (case-insensitive AND search).
 *
 * Searches across the top-level sections index AND all per-document
 * _index.md files, so the agent can find relevant sections by keyword
 * without loading full documents.
 */
export async function searchDocuments(query: string): Promise<string> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return listDocuments();
  }

  const searchIndex = await getSearchIndex();
  const results: string[] = [];

  for (const [docPath, indexContent] of searchIndex) {
    // The top-level index is stored with key "documents/sections-index.md"
    // or "documents/document-index.md"
    const isTopLevel =
      docPath.endsWith("sections-index.md") ||
      docPath.endsWith("document-index.md");
    for (const line of indexContent.split("\n")) {
      if (tokens.every((token) => line.toLowerCase().includes(token))) {
        if (isTopLevel) {
          results.push(line);
        } else {
          // Per-document index — prefix with document name
          const match = docPath.match(/^documents\/(.+)\/_index\.md$/);
          const docName = match ? `${match[1]}` : docPath;
          results.push(`[${docName}] ${line}`);
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
    limited.push(
      `\n... and ${unique.length - 200} more results. Refine your query.`,
    );
  }

  return limited.join("\n");
}

/**
 * Get the full search index (top-level + all per-document _index.md files).
 * Cached after first load.
 */
async function getSearchIndex(): Promise<Map<string, string>> {
  if (searchIndexCache) return searchIndexCache;

  const index = new Map<string, string>();

  if (r2Bucket) {
    // List all objects in the documents/ prefix
    const topIndex = await listDocuments();
    index.set("documents/sections-index.md", topIndex);

    // List all _index.md files in subdirectories
    const listed = await r2Bucket.list({ prefix: "documents/" });
    for (const obj of listed.objects) {
      if (obj.key.endsWith("/_index.md")) {
        const body = await r2Bucket.get(obj.key);
        if (body) {
          index.set(obj.key, await body.text());
        }
      }
    }
  } else {
    // Filesystem mode
    const fs = getFs();
    const path = getPath();
    const docsDir = getDocsDir();

    // Top-level index
    const topIndex = await listDocuments();
    index.set("sections-index.md", topIndex);

    // Walk subdirectories for _index.md files
    const categories = ["provincial", "upper-tier", "single-tier", "zoning"];
    for (const cat of categories) {
      const catDir = path.join(docsDir, cat);
      if (!fs.existsSync(catDir)) continue;

      for (const subDir of fs.readdirSync(catDir, { withFileTypes: true })) {
        if (!subDir.isDirectory()) continue;
        const indexFile = path.join(catDir, subDir.name, "_index.md");
        if (!fs.existsSync(indexFile)) continue;

        const indexContent = fs.readFileSync(indexFile, "utf-8");
        index.set(`documents/${cat}/${subDir.name}/_index.md`, indexContent);
      }
    }
  }

  searchIndexCache = index;
  return index;
}

// -- Public API: skill files (SKILL.md, report template) -------------------

/**
 * Read a file from the skill directory (SKILL.md, templates/*, etc.)
 */
export async function readSkillFile(relPath: string): Promise<string> {
  if (r2Bucket) {
    // Skill files are stored in R2 with their original path (no `documents/` prefix)
    const obj = await r2Bucket.get(relPath);
    if (!obj) {
      throw new Error(`Skill file not found: "${relPath}"`);
    }
    return await obj.text();
  }

  // Filesystem mode
  const fs = getFs();
  const path = getPath();
  const skillDir = getSkillDir();
  const fullPath = path.join(skillDir, relPath);
  return fs.readFileSync(fullPath, "utf-8");
}
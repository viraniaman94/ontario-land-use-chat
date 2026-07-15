#!/usr/bin/env node
/**
 * Upload missing .md planning documents to Cloudflare R2.
 * Lists existing R2 objects first, then only uploads files not already present.
 */

import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const BUCKET = "ontario-land-use-docs";
const ACCOUNT_ID = "76381460ad19b9774c66b853c47ba78b";
const SKILL_DIR = process.env.SKILL_DIR ||
  join(homedir(), ".hermes/skills/ontario-land-use-feasibility");
const CONCURRENCY = 3;

// Read OAuth token from wrangler config (TOML file)
const configPath = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
const configText = readFileSync(configPath, "utf-8");
const tokenMatch = configText.match(/oauth_token\s*=\s*"(.+)"/);
const OAUTH_TOKEN = tokenMatch ? tokenMatch[1] : "";

if (!OAUTH_TOKEN) {
  console.error("Could not read OAuth token from wrangler config");
  process.exit(1);
}

console.log(`📁 Skill directory: ${SKILL_DIR}`);
console.log(`🪣 R2 bucket: ${BUCKET}`);
console.log();

// ── List existing R2 objects via Cloudflare API (paginated) ──────────────
async function listR2Objects() {
  const allKeys = new Set();
  let cursor = "";

  do {
    let url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?per_page=1000`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${OAUTH_TOKEN}` },
    });
    const data = await resp.json();
    if (!data.success) {
      console.error("Failed to list R2 objects:", data.errors);
      process.exit(1);
    }
    for (const obj of data.result) {
      allKeys.add(obj.key);
    }
    cursor = data.result_info?.cursor || "";
  } while (cursor);

  return allKeys;
}

// ── Walk directory for .md files ─────────────────────────────────────────
function walk(dir, prefix = "") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...walk(fullPath, relPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ localPath: fullPath, r2Key: relPath });
    }
  }
  return files;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("📋 Listing existing R2 objects...");
  const existingKeys = await listR2Objects();
  console.log(`   Found ${existingKeys.size} objects in R2\n`);

  // Collect local .md files
  const allFiles = [];
  const docsDir = join(SKILL_DIR, "documents");
  if (existsSync(docsDir)) allFiles.push(...walk(docsDir, "documents"));
  const skillMd = join(SKILL_DIR, "SKILL.md");
  if (existsSync(skillMd)) allFiles.push({ localPath: skillMd, r2Key: "SKILL.md" });
  const templatesDir = join(SKILL_DIR, "templates");
  if (existsSync(templatesDir)) allFiles.push(...walk(templatesDir, "templates"));

  // Filter to only missing files
  const missingFiles = allFiles.filter(f => !existingKeys.has(f.r2Key));
  console.log(`📦 Total local .md files: ${allFiles.length}`);
  console.log(`✅ Already in R2:          ${allFiles.length - missingFiles.length}`);
  console.log(`⬆️  Need to upload:         ${missingFiles.length}\n`);

  if (missingFiles.length === 0) {
    console.log("🎉 All files are already in R2!");
    return;
  }

  let uploaded = 0;
  let failed = 0;
  let index = 0;

  async function uploadOne(file) {
    const size = statSync(file.localPath).size;
    const sizeStr = size > 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${(size / 1024).toFixed(0)} KB`;
    try {
      await execAsync(
        `npx wrangler r2 object put ${BUCKET}/${file.r2Key} --file "${file.localPath}" --remote`,
        { timeout: 60000, maxBuffer: 1024 * 1024 },
      );
      process.stdout.write(`  ✅ ${file.r2Key} (${sizeStr})\n`);
      uploaded++;
    } catch {
      process.stdout.write(`  ❌ ${file.r2Key} (${sizeStr})\n`);
      failed++;
    }
  }

  async function worker() {
    while (index < missingFiles.length) {
      const myIndex = index++;
      await uploadOne(missingFiles[myIndex]);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log();
  console.log(`✅ Uploaded: ${uploaded}`);
  console.log(`❌ Failed:   ${failed}`);
  console.log(`📊 Total:    ${missingFiles.length}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
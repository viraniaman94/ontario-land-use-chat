import { chmod, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Installs git hooks for this project.
// Run this after cloning the repo:  bun run setup:hooks

const gitDir = execSync("git rev-parse --git-dir", { encoding: "utf-8" }).trim();
const hooksDir = join(gitDir, "hooks");
await mkdir(hooksDir, { recursive: true });

const sourceDir = join(import.meta.dir, "hooks");
const hooks = ["pre-commit", "pre-push"];

for (const hook of hooks) {
  const dest = join(hooksDir, hook);
  await copyFile(join(sourceDir, hook), dest);
  await chmod(dest, 0o755);
}

console.log("✓ Installed git hooks:");
console.log(`  ${join(hooksDir, "pre-commit")}  (AGENTS.md size guard)`);
console.log(`  ${join(hooksDir, "pre-push")}     (EC2 deploy before push)`);
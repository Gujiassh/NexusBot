#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "scripts", "tests"];
const extensions = new Set([".js", ".mjs"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const targets = roots.flatMap((root) => walk(path.resolve(process.cwd(), root)));
if (!targets.length) {
  console.log("lint: no files to check");
  process.exit(0);
}

let failures = 0;
for (const file of targets) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "pipe" });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(result.stderr || "");
    process.stderr.write(`lint: syntax error in ${file}\n`);
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log(`lint: syntax check passed for ${targets.length} files`);

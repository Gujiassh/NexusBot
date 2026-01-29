import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseFrontmatter(text) {
  const lines = String(text || "").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const data = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    data[key] = value;
  }
  return data;
}

async function collectSkillDirs(rootDir) {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDir, entry.name));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function listSkills(extraRoots = []) {
  const roots = [
    path.join(os.homedir(), ".codex", "skills"),
    ...extraRoots.filter(Boolean),
  ];
  const skillDirs = [];
  for (const root of roots) {
    skillDirs.push(...(await collectSkillDirs(root)));
  }

  const skills = [];
  for (const dir of skillDirs) {
    const skillPath = path.join(dir, "SKILL.md");
    try {
      const raw = await fs.readFile(skillPath, "utf8");
      const meta = parseFrontmatter(raw) || {};
      skills.push({
        name: meta.name || path.basename(dir),
        description: meta.description || "",
        path: skillPath,
      });
    } catch {
      // ignore missing or unreadable SKILL.md
    }
  }

  return skills;
}

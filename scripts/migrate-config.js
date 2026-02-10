#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetPath = path.join(repoRoot, "config.json");
const sourcePath =
  process.env.OLD_BRIDGE_CONFIG || "/home/cc/codex-discord-bridge/config.json";

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  const text = String(value).trim();
  if (!text) return true;
  const upper = text.toUpperCase();

  if (upper.includes("PASTE_DISCORD_BOT_TOKEN")) return true;
  if (upper.includes("OWNER_USER_ID")) return true;
  if (upper.includes("/PATH/TO/WORKSPACE")) return true;
  if (upper.includes("CHANNEL_ID")) return true;

  return false;
}

function preferCurrentThenOld(current, old, fallback) {
  if (!isPlaceholder(current)) return String(current).trim();
  if (!isPlaceholder(old)) return String(old).trim();
  return fallback;
}

function pickOwner(config) {
  if (!config || typeof config !== "object") return undefined;
  if (!isPlaceholder(config.ownerUserId)) return config.ownerUserId;
  if (Array.isArray(config.ownerUserIds)) {
    const first = config.ownerUserIds.find((item) => !isPlaceholder(item));
    if (first) return first;
  }
  return undefined;
}

async function main() {
  const oldConfig = await readJson(sourcePath);
  if (!oldConfig) {
    console.error(`Old config not found: ${sourcePath}`);
    process.exit(1);
  }

  const current = (await readJson(targetPath)) || {};

  const next = {
    ...current,
    discordToken: preferCurrentThenOld(
      current.discordToken,
      oldConfig.discordToken,
      "PASTE_DISCORD_BOT_TOKEN"
    ),
    ownerUserId: preferCurrentThenOld(current.ownerUserId, pickOwner(oldConfig), "OWNER_USER_ID"),
    codexCwd: preferCurrentThenOld(current.codexCwd, oldConfig.codexCwd, "/home/cc"),
    registerSlashCommands: current.registerSlashCommands ?? true,
    allowPlainTextDm: current.allowPlainTextDm ?? true,
  };

  await fs.writeFile(targetPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        updated: targetPath,
        from: sourcePath,
        fields: ["discordToken", "ownerUserId", "codexCwd"],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

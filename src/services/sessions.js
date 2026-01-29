import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import readline from "node:readline";

const ROLLOUT_PREFIX = "rollout-";
const ROLLOUT_SUFFIX = ".jsonl";

async function collectRolloutFiles(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRolloutFiles(fullPath)));
    } else if (entry.isFile()) {
      if (entry.name.startsWith(ROLLOUT_PREFIX) && entry.name.endsWith(ROLLOUT_SUFFIX)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function readFirstLine(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    rl.close();
    stream.destroy();
  };
  try {
    for await (const line of rl) {
      cleanup();
      return line;
    }
  } finally {
    cleanup();
  }
  return "";
}

function parseSessionMeta(line) {
  if (!line) return {};
  try {
    const parsed = JSON.parse(line);
    if (parsed?.type !== "session_meta") return {};
    const payload = parsed.payload || {};
    return {
      id: payload.id,
      timestamp: payload.timestamp || parsed.timestamp,
      cwd: payload.cwd,
      originator: payload.originator,
    };
  } catch {
    return {};
  }
}

export async function listSessions(cfg, limitOverride) {
  const limit =
    Number.isFinite(limitOverride) && limitOverride > 0 ? limitOverride : cfg.sessionsLimit;
  const files = await collectRolloutFiles(cfg.sessionsDir);
  if (files.length === 0) {
    return { sessions: [], total: 0 };
  }

  const withStats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
  );

  const sorted = withStats
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const slice = sorted.slice(0, Math.max(1, limit));
  const sessions = [];
  for (const item of slice) {
    const firstLine = await readFirstLine(item.filePath);
    const meta = parseSessionMeta(firstLine);
    sessions.push({
      ...meta,
      filePath: item.filePath,
      mtimeMs: item.mtimeMs,
    });
  }

  return { sessions, total: sorted.length };
}

export function findSessionById(sessions, sessionId) {
  if (!sessionId) return null;
  const normalized = String(sessionId).trim();
  if (!normalized) return null;
  return sessions.find((entry) => entry.id === normalized) || null;
}

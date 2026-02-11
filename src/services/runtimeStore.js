import fs from "node:fs/promises";
import path from "node:path";

import { redactText } from "../utils/redact.js";

function withNow(value = new Date()) {
  return value.toISOString();
}

async function ensureParent(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function defaultRuntimeState() {
  return {
    activeThreadId: null,
    activeTurnId: null,
    activeTaskId: null,
    queueLength: 0,
    appServerStatus: "starting",
    discordStatus: "connecting",
    lastError: null,
    updatedAt: withNow(),
  };
}

function tryParseJsonLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null;
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toTaskSnapshot(previous, event) {
  const prior = previous || {};
  const current = event || {};

  return {
    ...prior,
    ...current,
    createdAt: prior.createdAt || current.createdAt || current.updatedAt || null,
    updatedAt: current.updatedAt || prior.updatedAt || null,
  };
}

export async function initializeRuntimeStore(cfg) {
  await fs.mkdir(cfg.dataDir, { recursive: true });
  await fs.mkdir(cfg.logsDir, { recursive: true });
  await ensureParent(cfg.tasksFile);
  await ensureParent(cfg.runtimeStateFile);
  await ensureParent(cfg.logFile);

  try {
    await fs.access(cfg.runtimeStateFile);
  } catch {
    await fs.writeFile(cfg.runtimeStateFile, `${JSON.stringify(defaultRuntimeState(), null, 2)}\n`, "utf8");
  }
}

export async function loadRuntimeState(cfg) {
  try {
    const raw = await fs.readFile(cfg.runtimeStateFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : defaultRuntimeState();
  } catch {
    return defaultRuntimeState();
  }
}

export async function saveRuntimeState(cfg, state) {
  const payload = {
    ...state,
    updatedAt: withNow(),
  };
  await ensureParent(cfg.runtimeStateFile);
  await fs.writeFile(cfg.runtimeStateFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function appendTaskEvent(cfg, event, secrets = []) {
  const payload = {
    ...event,
    updatedAt: withNow(),
  };
  await ensureParent(cfg.tasksFile);
  await fs.appendFile(cfg.tasksFile, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function listRecentTaskSnapshots(cfg, { limit = 10 } = {}) {
  const safeLimit = Math.max(1, Number.parseInt(String(limit), 10) || 10);

  let raw;
  try {
    raw = await fs.readFile(cfg.tasksFile, "utf8");
  } catch {
    return [];
  }

  const snapshots = new Map();
  const lines = raw.split("\n");

  for (const line of lines) {
    const event = tryParseJsonLine(line);
    if (!event?.taskId) continue;

    const prev = snapshots.get(event.taskId);
    snapshots.set(event.taskId, toTaskSnapshot(prev, event));
  }

  return [...snapshots.values()]
    .sort((a, b) => {
      const aKey = a.createdAt || a.updatedAt || "";
      const bKey = b.createdAt || b.updatedAt || "";
      return bKey.localeCompare(aKey);
    })
    .slice(0, safeLimit);
}

export function createLogger(cfg, secrets = []) {
  async function write(level, message, context) {
    const text = redactText(message, secrets);
    const entry = {
      ts: withNow(),
      level,
      message: text,
      ...(context && typeof context === "object" ? context : {}),
    };

    const serialized = JSON.stringify(entry);
    const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    writer(serialized);

    try {
      await ensureParent(cfg.logFile);
      await fs.appendFile(cfg.logFile, `${serialized}\n`, "utf8");
    } catch {
    }
  }

  return {
    debug(message, context) {
      void write("debug", message, context);
    },
    info(message, context) {
      void write("info", message, context);
    },
    warn(message, context) {
      void write("warn", message, context);
    },
    error(message, context) {
      void write("error", message, context);
    },
  };
}

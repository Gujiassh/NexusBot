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

export async function initializeRuntimeStore(cfg) {
  await fs.mkdir(cfg.dataDir, { recursive: true });
  await fs.mkdir(cfg.logsDir, { recursive: true });
  await ensureParent(cfg.tasksFile);
  await ensureParent(cfg.runtimeStateFile);
  await ensureParent(cfg.logFile);

  try {
    await fs.access(cfg.runtimeStateFile);
  } catch {
    const initial = {
      activeThreadId: null,
      activeTurnId: null,
      activeTaskId: null,
      queueLength: 0,
      appServerStatus: "starting",
      discordStatus: "connecting",
      lastError: null,
      updatedAt: withNow(),
    };
    await fs.writeFile(cfg.runtimeStateFile, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

export async function loadRuntimeState(cfg) {
  try {
    const raw = await fs.readFile(cfg.runtimeStateFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed
      : {
        activeThreadId: null,
        activeTurnId: null,
        activeTaskId: null,
        queueLength: 0,
        appServerStatus: "starting",
        discordStatus: "connecting",
        lastError: null,
        updatedAt: withNow(),
      };
  } catch {
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

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = process.env.BRIDGE_CONFIG || path.resolve(process.cwd(), "config.json");

function parseBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseIntSafe(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number.parseInt(String(value), 10);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return num;
}

function parseStringList(value, fallback = []) {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return undefined;
}

function parseTaskThreadMode(value, fallback = "isolated") {
  const raw = firstNonEmpty(value, fallback, "isolated");
  const mode = String(raw).trim().toLowerCase();
  if (mode === "isolated" || mode === "shared") {
    return mode;
  }
  throw new Error(`Invalid taskThreadMode: ${value}`);
}

async function loadFileConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function resolveOwnerUserId(fileConfig) {
  return firstNonEmpty(
    process.env.OWNER_USER_ID,
    fileConfig.ownerUserId,
    parseStringList(process.env.OWNER_USER_IDS, [])[0],
    parseStringList(fileConfig.ownerUserIds, [])[0]
  );
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export async function updateConfigFile(patch) {
  const current = await loadFileConfig();
  const next = {
    ...current,
    ...(patch || {}),
  };
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function loadConfig() {
  const fileConfig = await loadFileConfig();

  const ownerUserId = resolveOwnerUserId(fileConfig);
  const cwd = path.resolve(
    firstNonEmpty(process.env.CODEX_CWD, fileConfig.codexCwd, process.cwd())
  );

  const dataDir = path.resolve(firstNonEmpty(process.env.DATA_DIR, fileConfig.dataDir, "./data"));
  const logsDir = path.resolve(firstNonEmpty(process.env.LOGS_DIR, fileConfig.logsDir, "./logs"));

  const cfg = {
    discordToken: firstNonEmpty(process.env.DISCORD_TOKEN, fileConfig.discordToken),
    ownerUserId,
    codexCwd: cwd,
    codexCommand: firstNonEmpty(process.env.CODEX_COMMAND, fileConfig.codexCommand, "codex"),
    codexModel: firstNonEmpty(process.env.CODEX_MODEL, fileConfig.codexModel, undefined),
    codexSandbox: firstNonEmpty(process.env.CODEX_SANDBOX, fileConfig.codexSandbox, "workspace-write"),
    codexApprovalPolicy: firstNonEmpty(
      process.env.CODEX_APPROVAL_POLICY,
      fileConfig.codexApprovalPolicy,
      "never"
    ),
    sendTyping: parseBool(process.env.SEND_TYPING, parseBool(fileConfig.sendTyping, true)),
    allowPlainTextDm: parseBool(
      process.env.ALLOW_PLAIN_TEXT_DM,
      parseBool(fileConfig.allowPlainTextDm, true)
    ),
    registerSlashCommands: parseBool(
      process.env.REGISTER_SLASH_COMMANDS,
      parseBool(fileConfig.registerSlashCommands, true)
    ),
    slashGuildIds: parseStringList(
      process.env.SLASH_GUILD_IDS,
      parseStringList(fileConfig.slashGuildIds, [])
    ),
    streamUpdateIntervalMs: parseIntSafe(
      process.env.STREAM_UPDATE_INTERVAL_MS,
      parseIntSafe(fileConfig.streamUpdateIntervalMs, 1500)
    ),
    ackMessage: firstNonEmpty(process.env.ACK_MESSAGE, fileConfig.ackMessage, "收到，任务已排队"),
    turnTimeoutMs: parseIntSafe(process.env.TURN_TIMEOUT_MS, parseIntSafe(fileConfig.turnTimeoutMs, 15 * 60 * 1000)),
    requestTimeoutMs: parseIntSafe(
      process.env.REQUEST_TIMEOUT_MS,
      parseIntSafe(fileConfig.requestTimeoutMs, 30 * 1000)
    ),
    maxConcurrentTasks: Math.max(
      1,
      parseIntSafe(process.env.MAX_CONCURRENT_TASKS, parseIntSafe(fileConfig.maxConcurrentTasks, 2))
    ),
    taskThreadMode: parseTaskThreadMode(process.env.TASK_THREAD_MODE ?? fileConfig.taskThreadMode, "isolated"),
    historyDefaultLimit: Math.max(
      1,
      parseIntSafe(process.env.HISTORY_DEFAULT_LIMIT, parseIntSafe(fileConfig.historyDefaultLimit, 10))
    ),
    recallDefaultLimit: Math.max(
      1,
      parseIntSafe(process.env.RECALL_DEFAULT_LIMIT, parseIntSafe(fileConfig.recallDefaultLimit, 8))
    ),
    lockFile: path.resolve(firstNonEmpty(process.env.LOCK_FILE, fileConfig.lockFile, "/tmp/codex-discord-bridge-v2.lock")),
    dataDir,
    logsDir,
    tasksFile: path.resolve(firstNonEmpty(process.env.TASKS_FILE, fileConfig.tasksFile, path.join(dataDir, "tasks.jsonl"))),
    runtimeStateFile: path.resolve(
      firstNonEmpty(process.env.RUNTIME_STATE_FILE, fileConfig.runtimeStateFile, path.join(dataDir, "runtime_state.json"))
    ),
    logFile: path.resolve(firstNonEmpty(process.env.LOG_FILE, fileConfig.logFile, path.join(logsDir, "bridge.log"))),
    minStreamPreviewChars: parseIntSafe(
      process.env.MIN_STREAM_PREVIEW_CHARS,
      parseIntSafe(fileConfig.minStreamPreviewChars, 1200)
    ),
  };

  if (!cfg.discordToken) {
    throw new Error("Missing discordToken. Set DISCORD_TOKEN or config.json.discordToken");
  }
  if (!cfg.ownerUserId) {
    throw new Error("Missing ownerUserId. Set OWNER_USER_ID or config.json.ownerUserId");
  }

  return cfg;
}

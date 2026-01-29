import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const CONFIG_PATH = process.env.BRIDGE_CONFIG || path.resolve(process.cwd(), "config.json");

export function getConfigPath() {
  return CONFIG_PATH;
}

function toBool(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function toNumber(value) {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return num;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envList(name) {
  if (process.env[name] === undefined) return undefined;
  const raw = String(process.env[name]);
  if (!raw.trim()) return [];
  return splitList(raw);
}

function envJsonArray(name) {
  if (process.env[name] === undefined) return undefined;
  const raw = String(process.env[name]).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`);
  return parsed;
}

function envJsonObject(name) {
  if (process.env[name] === undefined) return undefined;
  const raw = String(process.env[name]).trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return parsed;
}

function coalesce(override, base, fallback) {
  if (override !== undefined) return override;
  if (base !== undefined) return base;
  return fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeArgs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeNumber(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return num;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizePositiveInt(value, fallback) {
  const num = normalizeNumber(value, fallback);
  if (num === undefined || num === null) return fallback;
  return Math.max(1, Math.trunc(num));
}

export async function loadConfig() {
  let fileConfig = {};
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    fileConfig = JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const envConfig = {
    discordToken: process.env.DISCORD_TOKEN,
    commandPrefix: process.env.COMMAND_PREFIX,
    channelAllowlist: envList("CHANNEL_ALLOWLIST"),
    allowedUserIds: envList("ALLOWED_USER_IDS"),
    allowedRoleIds: envList("ALLOWED_ROLE_IDS"),
    codexSessionId: process.env.CODEX_SESSION_ID,
    codexCwd: process.env.CODEX_CWD,
    codexArgs: envJsonArray("CODEX_ARGS"),
    memoryDir: process.env.MEMORY_DIR,
    memoryJsonl: process.env.MEMORY_JSONL,
    memoryMarkdown: process.env.MEMORY_MD,
    replyOnError: toBool(process.env.REPLY_ON_ERROR),
    sendTyping: toBool(process.env.SEND_TYPING),
    immediateAck: toBool(process.env.IMMEDIATE_ACK),
    ackMessage: process.env.ACK_MESSAGE,
    logRejections: toBool(process.env.LOG_REJECTIONS),
    rejectionLog: process.env.REJECTION_LOG,
    reconnectTimeoutMs: toNumber(process.env.RECONNECT_TIMEOUT_MS),
    reconnectIntervalMs: toNumber(process.env.RECONNECT_INTERVAL_MS),
    importantKeywords: envList("IMPORTANT_KEYWORDS"),
    importantJsonl: process.env.IMPORTANT_JSONL,
    importantMarkdown: process.env.IMPORTANT_MD,
    importantReply: process.env.IMPORTANT_REPLY,
    allowDm: toBool(process.env.ALLOW_DM),
    autoReplyInDm: toBool(process.env.AUTO_REPLY_DM),
    autoReplyInChannels: toBool(process.env.AUTO_REPLY_CHANNELS),
    mentionReplyInChannels: toBool(process.env.MENTION_REPLY_CHANNELS),
    perUserSessions: toBool(process.env.PER_USER_SESSIONS),
    userSessionsFile: process.env.USER_SESSIONS_FILE,
    ownerUserId: process.env.OWNER_USER_ID,
    ownerUserIds: envList("OWNER_USER_IDS"),
    adminChannelId: process.env.ADMIN_CHANNEL_ID,
    adminChannelName: process.env.ADMIN_CHANNEL_NAME,
    requireOwnerApproval: toBool(process.env.REQUIRE_OWNER_APPROVAL),
    approvalsLog: process.env.APPROVALS_LOG,
    approvalUseModel: toBool(process.env.APPROVAL_USE_MODEL),
    approvalAllowlistUserIds: envList("APPROVAL_ALLOWLIST_USER_IDS"),
    approvalAllowlistRoleIds: envList("APPROVAL_ALLOWLIST_ROLE_IDS"),
    approvalAllowlistChannelIds: envList("APPROVAL_ALLOWLIST_CHANNEL_IDS"),
    approvalAllowlistGuildIds: envList("APPROVAL_ALLOWLIST_GUILD_IDS"),
    approvalAllowlistPatterns: envList("APPROVAL_ALLOWLIST_PATTERNS"),
    approvalRules: envJsonObject("APPROVAL_RULES"),
    useAgentsSdk: toBool(process.env.USE_AGENTS_SDK),
    autoTaskRouting: toBool(process.env.AUTO_TASK_ROUTING),
    taskRoutingTimeoutMs: toNumber(process.env.TASK_ROUTING_TIMEOUT_MS),
    taskRoutingKeywords: envList("TASK_ROUTING_KEYWORDS"),
    taskRoutingMinChars: toNumber(process.env.TASK_ROUTING_MIN_CHARS),
    codexSweepIntervalMs: toNumber(process.env.CODEX_SWEEP_INTERVAL_MS),
    codexSweepMaxAgeSec: toNumber(process.env.CODEX_SWEEP_MAX_AGE_SEC),
    schedulesFile: process.env.SCHEDULES_FILE,
    safetyDenylistKeywords: envList("SAFETY_DENYLIST_KEYWORDS"),
    safetyDenylistReject: toBool(process.env.SAFETY_DENYLIST_REJECT),
    messageServerEnabled: toBool(process.env.MESSAGE_SERVER_ENABLED),
    messageServerPort: toNumber(process.env.MESSAGE_SERVER_PORT),
    messageServerToken: process.env.MESSAGE_SERVER_TOKEN,
    agentsPython: process.env.AGENTS_PYTHON,
    agentsScript: process.env.AGENTS_SCRIPT,
    agentsApprovalPolicy: process.env.AGENTS_APPROVAL_POLICY,
    agentsSandbox: process.env.AGENTS_SANDBOX,
    agentsThreadsFile: process.env.AGENTS_THREADS_FILE,
    agentsOpenaiApiKey: process.env.AGENTS_OPENAI_API_KEY,
    agentsOpenaiBaseUrl: process.env.AGENTS_OPENAI_BASE_URL,
    agentsHttpProxy: process.env.AGENTS_HTTP_PROXY,
    agentsHttpsProxy: process.env.AGENTS_HTTPS_PROXY,
    agentsNoProxy: process.env.AGENTS_NO_PROXY,
    lockFile: process.env.LOCK_FILE,
    registerSlashCommands: toBool(process.env.REGISTER_SLASH_COMMANDS),
    slashGuildIds: envList("SLASH_GUILD_IDS"),
    sessionsDir: process.env.SESSIONS_DIR,
    sessionsLimit: toNumber(process.env.SESSIONS_LIMIT),
    maxConcurrentRuns: toNumber(process.env.MAX_CONCURRENT_RUNS),
  };

  const merged = {
    discordToken: coalesce(envConfig.discordToken, fileConfig.discordToken, undefined),
    commandPrefix: coalesce(envConfig.commandPrefix, fileConfig.commandPrefix, "!nexus"),
    channelAllowlist: normalizeStringArray(
      coalesce(envConfig.channelAllowlist, fileConfig.channelAllowlist, [])
    ),
    allowedUserIds: normalizeStringArray(
      coalesce(envConfig.allowedUserIds, fileConfig.allowedUserIds, [])
    ),
    allowedRoleIds: normalizeStringArray(
      coalesce(envConfig.allowedRoleIds, fileConfig.allowedRoleIds, [])
    ),
    codexSessionId: coalesce(envConfig.codexSessionId, fileConfig.codexSessionId, undefined),
    codexCwd: coalesce(envConfig.codexCwd, fileConfig.codexCwd, process.cwd()),
    codexArgs: normalizeArgs(coalesce(envConfig.codexArgs, fileConfig.codexArgs, [])),
    memoryDir: coalesce(
      envConfig.memoryDir,
      fileConfig.memoryDir,
      path.resolve(process.cwd(), "memory")
    ),
    memoryJsonl: coalesce(envConfig.memoryJsonl, fileConfig.memoryJsonl, "memory.jsonl"),
    memoryMarkdown: coalesce(envConfig.memoryMarkdown, fileConfig.memoryMarkdown, "memory.md"),
    replyOnError: coalesce(envConfig.replyOnError, fileConfig.replyOnError, true),
    sendTyping: coalesce(envConfig.sendTyping, fileConfig.sendTyping, true),
    immediateAck: coalesce(envConfig.immediateAck, fileConfig.immediateAck, true),
    ackMessage: coalesce(envConfig.ackMessage, fileConfig.ackMessage, "acknowledged"),
    logRejections: coalesce(envConfig.logRejections, fileConfig.logRejections, true),
    rejectionLog: coalesce(envConfig.rejectionLog, fileConfig.rejectionLog, "rejections.jsonl"),
    reconnectTimeoutMs: normalizeNumber(
      coalesce(envConfig.reconnectTimeoutMs, fileConfig.reconnectTimeoutMs, 120000),
      120000
    ),
    reconnectIntervalMs: normalizeNumber(
      coalesce(envConfig.reconnectIntervalMs, fileConfig.reconnectIntervalMs, 30000),
      30000
    ),
    importantKeywords: normalizeStringArray(
      coalesce(envConfig.importantKeywords, fileConfig.importantKeywords, ["记住", "记一下", "记录"])
    ),
    importantJsonl: coalesce(envConfig.importantJsonl, fileConfig.importantJsonl, "important.jsonl"),
    importantMarkdown: coalesce(
      envConfig.importantMarkdown,
      fileConfig.importantMarkdown,
      "important.md"
    ),
    importantReply: coalesce(envConfig.importantReply, fileConfig.importantReply, "已记录"),
    allowDm: coalesce(envConfig.allowDm, fileConfig.allowDm, true),
    autoReplyInDm: coalesce(envConfig.autoReplyInDm, fileConfig.autoReplyInDm, true),
    autoReplyInChannels: coalesce(
      envConfig.autoReplyInChannels,
      fileConfig.autoReplyInChannels,
      false
    ),
    mentionReplyInChannels: coalesce(
      envConfig.mentionReplyInChannels,
      fileConfig.mentionReplyInChannels,
      false
    ),
    perUserSessions: coalesce(envConfig.perUserSessions, fileConfig.perUserSessions, false),
    userSessionsFile: coalesce(envConfig.userSessionsFile, fileConfig.userSessionsFile, undefined),
    ownerUserId: coalesce(envConfig.ownerUserId, fileConfig.ownerUserId, undefined),
    ownerUserIds: normalizeStringArray(
      coalesce(envConfig.ownerUserIds, fileConfig.ownerUserIds, [])
    ),
    adminChannelId: coalesce(envConfig.adminChannelId, fileConfig.adminChannelId, undefined),
    adminChannelName: coalesce(
      envConfig.adminChannelName,
      fileConfig.adminChannelName,
      "我的世界"
    ),
    requireOwnerApproval: coalesce(
      envConfig.requireOwnerApproval,
      fileConfig.requireOwnerApproval,
      undefined
    ),
    approvalsLog: coalesce(envConfig.approvalsLog, fileConfig.approvalsLog, "approvals.jsonl"),
    approvalUseModel: coalesce(envConfig.approvalUseModel, fileConfig.approvalUseModel, false),
    approvalAllowlistUserIds: normalizeStringArray(
      coalesce(envConfig.approvalAllowlistUserIds, fileConfig.approvalAllowlistUserIds, [])
    ),
    approvalAllowlistRoleIds: normalizeStringArray(
      coalesce(envConfig.approvalAllowlistRoleIds, fileConfig.approvalAllowlistRoleIds, [])
    ),
    approvalAllowlistChannelIds: normalizeStringArray(
      coalesce(
        envConfig.approvalAllowlistChannelIds,
        fileConfig.approvalAllowlistChannelIds,
        []
      )
    ),
    approvalAllowlistGuildIds: normalizeStringArray(
      coalesce(envConfig.approvalAllowlistGuildIds, fileConfig.approvalAllowlistGuildIds, [])
    ),
    approvalAllowlistPatterns: normalizeStringArray(
      coalesce(envConfig.approvalAllowlistPatterns, fileConfig.approvalAllowlistPatterns, [])
    ),
    approvalRules: normalizeObject(
      coalesce(envConfig.approvalRules, fileConfig.approvalRules, {})
    ),
    useAgentsSdk: coalesce(envConfig.useAgentsSdk, fileConfig.useAgentsSdk, false),
    autoTaskRouting: coalesce(envConfig.autoTaskRouting, fileConfig.autoTaskRouting, false),
    taskRoutingTimeoutMs: normalizeNumber(
      coalesce(envConfig.taskRoutingTimeoutMs, fileConfig.taskRoutingTimeoutMs, 15000),
      15000
    ),
    taskRoutingKeywords: normalizeStringArray(
      coalesce(envConfig.taskRoutingKeywords, fileConfig.taskRoutingKeywords, [])
    ),
    taskRoutingMinChars: normalizeNumber(
      coalesce(envConfig.taskRoutingMinChars, fileConfig.taskRoutingMinChars, 0),
      0
    ),
    codexSweepIntervalMs: normalizeNumber(
      coalesce(envConfig.codexSweepIntervalMs, fileConfig.codexSweepIntervalMs, 10800000),
      10800000
    ),
    codexSweepMaxAgeSec: normalizeNumber(
      coalesce(envConfig.codexSweepMaxAgeSec, fileConfig.codexSweepMaxAgeSec, 10800),
      10800
    ),
    schedulesFile: coalesce(envConfig.schedulesFile, fileConfig.schedulesFile, undefined),
    safetyDenylistKeywords: normalizeStringArray(
      coalesce(envConfig.safetyDenylistKeywords, fileConfig.safetyDenylistKeywords, [])
    ),
    safetyDenylistReject: coalesce(
      envConfig.safetyDenylistReject,
      fileConfig.safetyDenylistReject,
      false
    ),
    messageServerEnabled: coalesce(
      envConfig.messageServerEnabled,
      fileConfig.messageServerEnabled,
      false
    ),
    messageServerPort: normalizeNumber(
      coalesce(envConfig.messageServerPort, fileConfig.messageServerPort, 18790),
      18790
    ),
    messageServerToken: coalesce(
      envConfig.messageServerToken,
      fileConfig.messageServerToken,
      ""
    ),
    agentsPython: coalesce(envConfig.agentsPython, fileConfig.agentsPython, "python3"),
    agentsScript: coalesce(
      envConfig.agentsScript,
      fileConfig.agentsScript,
      path.join(process.cwd(), "agents", "agents_runner.py")
    ),
    agentsApprovalPolicy: coalesce(
      envConfig.agentsApprovalPolicy,
      fileConfig.agentsApprovalPolicy,
      "never"
    ),
    agentsSandbox: coalesce(
      envConfig.agentsSandbox,
      fileConfig.agentsSandbox,
      "workspace-write"
    ),
    agentsThreadsFile: coalesce(
      envConfig.agentsThreadsFile,
      fileConfig.agentsThreadsFile,
      path.join(process.cwd(), "memory", "agents_threads.json")
    ),
    agentsOpenaiApiKey: coalesce(
      envConfig.agentsOpenaiApiKey,
      fileConfig.agentsOpenaiApiKey,
      undefined
    ),
    agentsOpenaiBaseUrl: coalesce(
      envConfig.agentsOpenaiBaseUrl,
      fileConfig.agentsOpenaiBaseUrl,
      undefined
    ),
    agentsHttpProxy: coalesce(envConfig.agentsHttpProxy, fileConfig.agentsHttpProxy, undefined),
    agentsHttpsProxy: coalesce(envConfig.agentsHttpsProxy, fileConfig.agentsHttpsProxy, undefined),
    agentsNoProxy: coalesce(envConfig.agentsNoProxy, fileConfig.agentsNoProxy, undefined),
    lockFile: coalesce(
      envConfig.lockFile,
      fileConfig.lockFile,
      path.join(os.tmpdir(), "nexusbot.lock")
    ),
    registerSlashCommands: coalesce(
      envConfig.registerSlashCommands,
      fileConfig.registerSlashCommands,
      true
    ),
    slashGuildIds: normalizeStringArray(
      coalesce(envConfig.slashGuildIds, fileConfig.slashGuildIds, [])
    ),
    sessionsDir: coalesce(
      envConfig.sessionsDir,
      fileConfig.sessionsDir,
      path.join(os.homedir(), ".codex", "sessions")
    ),
    sessionsLimit: normalizeNumber(
      coalesce(envConfig.sessionsLimit, fileConfig.sessionsLimit, 10),
      10
    ),
    maxConcurrentRuns: normalizePositiveInt(
      coalesce(envConfig.maxConcurrentRuns, fileConfig.maxConcurrentRuns, 1),
      1
    ),
  };

  if (!merged.discordToken) {
    throw new Error("Missing discordToken (set in config.json or DISCORD_TOKEN)");
  }
  if (!merged.codexSessionId) {
    throw new Error("Missing codexSessionId (set in config.json or CODEX_SESSION_ID)");
  }

  if (!merged.ownerUserIds.length && merged.ownerUserId) {
    merged.ownerUserIds = [merged.ownerUserId];
  }

  if (!merged.userSessionsFile) {
    merged.userSessionsFile = path.join(merged.memoryDir, "user_sessions.json");
  }
  if (!merged.schedulesFile) {
    merged.schedulesFile = path.join(merged.memoryDir, "schedules.json");
  }

  if (merged.requireOwnerApproval === undefined) {
    merged.requireOwnerApproval = merged.ownerUserIds.length > 0;
  }

  if (merged.agentsOpenaiApiKey === "FROM_CODEX_CONFIG") {
    try {
      const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
      const raw = await fs.readFile(codexConfigPath, "utf8");
      const baseUrlMatch = raw.match(/base_url\\s*=\\s*\"([^\"]+)\"/);
      if (baseUrlMatch?.[1]) {
        merged.agentsOpenaiBaseUrl = merged.agentsOpenaiBaseUrl || baseUrlMatch[1];
      }

      const authPath = path.join(os.homedir(), ".codex", "auth.json");
      const authRaw = await fs.readFile(authPath, "utf8");
      const auth = JSON.parse(authRaw);
      const key =
        auth?.OPENAI_API_KEY || auth?.access_token || auth?.api_key || undefined;
      merged.agentsOpenaiApiKey = key;
    } catch (err) {
      console.warn("load codex auth failed", err?.message || err);
    }
  }

  return merged;
}

export async function updateConfigFile(patch) {
  const cleaned = Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== undefined)
  );
  let fileConfig = {};
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    fileConfig = JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const nextConfig = { ...fileConfig, ...cleaned };
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { COMMAND_NAMES } from "./commands/slashCommands.js";
import { loadConfig } from "./services/config.js";
import { CodexAppServerClient } from "./services/codexAppServerClient.js";
import {
  checkInteractionAccess,
  checkMessageAccess,
  createDiscordClient,
} from "./services/discordClient.js";
import { acquireInstanceLock } from "./services/instanceLock.js";
import {
  appendTaskEvent,
  createLogger,
  initializeRuntimeStore,
  listRecentTaskSnapshots,
  loadRuntimeState,
  saveRuntimeState,
} from "./services/runtimeStore.js";
import { registerSlashCommands } from "./services/slashCommands.js";
import { createTaskId, TaskQueue } from "./services/taskQueue.js";
import { splitDiscordMessage } from "./utils/messageChunker.js";
import { collectSecrets, redactText } from "./utils/redact.js";

const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function formatDurationMs(startedAt) {
  if (!startedAt) return "-";
  const started = new Date(startedAt).valueOf();
  if (Number.isNaN(started)) return "-";
  const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return `${sec}s`;
}

function formatThreadPreview(entry) {
  const id = entry?.id || "(unknown)";
  const preview = String(entry?.preview || "").trim().replace(/\s+/g, " ");
  if (!preview) return id;
  return `${id} · ${preview.slice(0, 60)}`;
}

function formatCompactTs(iso) {
  if (!iso) return "-";
  const value = String(iso);
  if (value.length >= 19) {
    return value.replace("T", " ").slice(0, 19);
  }
  return value;
}

function statusIcon(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") return "✅";
  if (normalized === "running") return "⏳";
  if (normalized === "queued") return "🧾";
  if (normalized === "cancelled") return "🛑";
  if (normalized === "failed") return "❌";
  return "•";
}

function compactText(value, maxLen = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildHistoryText(taskSnapshots) {
  if (!taskSnapshots.length) {
    return "暂无历史任务记录";
  }

  const lines = ["🧾 最近任务记录"]; 
  taskSnapshots.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${statusIcon(item.status)} ${item.taskId || "(unknown)"} [${item.status || "unknown"}] ${formatCompactTs(item.createdAt)}`
    );

    const prompt = compactText(item.inputText, 100);
    if (prompt) lines.push(`   ↳ ${prompt}`);

    const summary = compactText(item.outputSummary || item.errorMessage, 100);
    if (summary) lines.push(`   ⇢ ${summary}`);
  });

  return lines.join("\n");
}

function buildRecallPrompt(taskSnapshots) {
  const ordered = [...taskSnapshots].reverse();
  const lines = ordered.map((item, index) => {
    const status = item.status || "unknown";
    const taskId = item.taskId || "(unknown)";
    const prompt = compactText(item.inputText, 180) || "(empty prompt)";
    const output = compactText(item.outputSummary || item.errorMessage || "", 180);

    if (output) {
      return `[${index + 1}] ${taskId} (${status})\n- 用户输入: ${prompt}\n- 结果摘要: ${output}`;
    }

    return `[${index + 1}] ${taskId} (${status})\n- 用户输入: ${prompt}`;
  });

  return [
    "请将以下历史任务摘要写入当前会话记忆，用于后续回答保持连续性。",
    "要求：",
    "1) 提炼用户偏好、进行中的目标、关键约束。",
    "2) 不要逐条复述，不要生成长文。",
    "3) 完成后仅回复：RECALL_OK",
    "",
    "历史摘要：",
    ...lines,
  ].join("\n");
}

function buildStatusText(runtime, queue) {
  const activeTaskIds = Array.isArray(runtime.activeTaskIds) ? runtime.activeTaskIds.filter(Boolean) : [];

  const lines = [
    "📊 Bridge Status",
    `- app-server: ${runtime.appServerStatus || "unknown"}`,
    `- discord: ${runtime.discordStatus || "unknown"}`,
    `- control thread: ${runtime.activeThreadId || "(none)"}`,
    `- queue length: ${queue.size}`,
    `- active tasks: ${runtime.activeTaskCount || 0}/${queue.concurrency}`,
    `- active task ids: ${activeTaskIds.length ? activeTaskIds.join(", ") : "(none)"}`,
    `- current turn: ${runtime.activeTurnId || "(none)"}`,
    `- running duration: ${formatDurationMs(runtime.activeTaskStartedAt)}`,
  ];

  if (runtime.lastError?.message) {
    lines.push(`- last error: ${runtime.lastError.message}`);
  }

  return lines.join("\n");
}

function buildLiveText(taskId, textOutput, cmdOutput, minPreviewChars) {
  const cleanedText = String(textOutput || "");
  const cleanedCmd = String(cmdOutput || "");

  if (!cleanedText && !cleanedCmd) {
    return `⏳ #${taskId} 任务执行中...`;
  }

  let merged = cleanedText;
  if (cleanedCmd) {
    const cmdTail = cleanedCmd.slice(-Math.max(minPreviewChars / 2, 300));
    merged = `${merged}\n\n--- command output tail ---\n${cmdTail}`;
  }

  const tail = merged.slice(-Math.max(minPreviewChars, 1200));
  return `⏳ #${taskId} 执行中（流式预览）\n\n${tail}`;
}

async function replyChunks(sendFn, content) {
  const chunks = splitDiscordMessage(content, 1900);
  for (const chunk of chunks) {
    await sendFn(chunk);
  }
}

function createInteractionSource(interaction) {
  return {
    sourceType: "slash",
    userId: interaction.user?.id,
    channelId: interaction.channelId,
    interactionId: interaction.id,
    async ack(content) {
      if (!interaction.deferred && !interaction.replied) {
        return interaction.reply({ content, fetchReply: true });
      }
      return interaction.followUp({ content, fetchReply: true });
    },
    async send(content) {
      if (!interaction.deferred && !interaction.replied) {
        return interaction.reply({ content, fetchReply: true });
      }
      return interaction.followUp({ content, fetchReply: true });
    },
  };
}

function createMessageSource(message) {
  return {
    sourceType: "dm_text",
    userId: message.author?.id,
    channelId: message.channelId,
    messageId: message.id,
    async ack(content) {
      return message.reply(content);
    },
    async send(content) {
      return message.channel.send(content);
    },
  };
}

function redactProxyUrl(proxyUrl) {
  if (!proxyUrl) return proxyUrl;
  return String(proxyUrl).replace(/:\/\/[^@]*@/, "://***@");
}

function getProxyUrlFromEnv() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
}

function configureProxyDispatcher(logger) {
  const proxyUrl = getProxyUrlFromEnv();
  if (!proxyUrl) return null;

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    logger?.info?.("proxy dispatcher enabled", { proxy: redactProxyUrl(proxyUrl) });
    return proxyUrl;
  } catch (error) {
    logger?.warn?.("failed to enable proxy dispatcher", {
      error: error?.message || String(error),
    });
    return null;
  }
}

async function configureDiscordGatewayProxy(logger, proxyUrl) {
  if (!proxyUrl) return false;

  try {
    const wsModule = require("ws");
    if (wsModule.__nexusGatewayProxyPatched) {
      return true;
    }

    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    const OriginalWebSocket = wsModule.WebSocket;

    class ProxyWebSocket extends OriginalWebSocket {
      constructor(address, protocols, options) {
        if (options === undefined && protocols && typeof protocols === "object" && !Array.isArray(protocols)) {
          const mergedOptions = {
            ...protocols,
            agent: protocols.agent || proxyAgent,
          };
          super(address, mergedOptions);
          return;
        }

        const mergedOptions = {
          ...(options || {}),
          agent: options?.agent || proxyAgent,
        };
        super(address, protocols, mergedOptions);
      }
    }

    wsModule.WebSocket = ProxyWebSocket;
    wsModule.default = ProxyWebSocket;
    wsModule.__nexusGatewayProxyPatched = true;
    logger?.info?.("discord gateway proxy enabled", {
      proxy: redactProxyUrl(proxyUrl),
    });
    return true;
  } catch (error) {
    logger?.warn?.("failed to enable discord gateway proxy", {
      error: error?.message || String(error),
    });
    return false;
  }
}

async function runStartupDiagnostics(cfg) {
  const probe = spawnSync(cfg.codexCommand, ["--help"], {
    cwd: cfg.codexCwd,
    encoding: "utf8",
  });

  if (probe.error) {
    throw new Error(`Codex CLI unavailable: ${probe.error.message}`);
  }

  if (typeof probe.status === "number" && probe.status !== 0) {
    const stderr = String(probe.stderr || "").slice(0, 300);
    throw new Error(`Codex CLI check failed with status ${probe.status}: ${stderr}`);
  }
}

async function main() {
  const cfg = await loadConfig();
  await initializeRuntimeStore(cfg);

  const secrets = collectSecrets(cfg);
  const logger = createLogger(cfg, secrets);

  const proxyUrl = configureProxyDispatcher(logger);
  await configureDiscordGatewayProxy(logger, proxyUrl);

  await runStartupDiagnostics(cfg);
  await acquireInstanceLock(cfg);

  let runtime = await loadRuntimeState(cfg);
  let runtimeWriteChain = Promise.resolve();

  const persistRuntime = async (patch = {}) => {
    runtimeWriteChain = runtimeWriteChain.then(async () => {
      runtime = {
        ...runtime,
        ...patch,
        updatedAt: nowIso(),
      };
      runtime = await saveRuntimeState(cfg, runtime);
      return runtime;
    });

    return runtimeWriteChain;
  };

  const activeTaskContexts = new Map();
  const cancelRequestedTaskIds = new Set();

  const queue = new TaskQueue({
    concurrency: cfg.maxConcurrentTasks,
    onStateChange: async ({ queueLength, activeTasks, activeCount }) => {
      const activeTaskIds = (activeTasks || [])
        .map((item) => item?.taskId)
        .filter(Boolean);

      const activeTaskId = activeTaskIds[0] || null;
      const activeContext = activeTaskId ? activeTaskContexts.get(activeTaskId) : null;

      await persistRuntime({
        queueLength,
        activeTaskCount: activeCount || 0,
        activeTaskIds,
        activeTaskId,
        activeTurnId: activeContext?.turnId || null,
        activeTaskStartedAt: activeContext?.startedAt || null,
      });
    },
  });

  const controlAppServer = new CodexAppServerClient(cfg, logger);

  controlAppServer.on("notification", (notification) => {
    const method = notification?.method;
    if (!method) return;

    const quietMethods = new Set([
      "codex/event/skills_update_available",
      "codex/event/token_count",
      "thread/tokenUsage/updated",
      "account/rateLimits/updated",
      "codex/event/mcp_startup_complete",
    ]);

    if (quietMethods.has(method)) return;

    const known = new Set([
      "turn/started",
      "item/agentMessage/delta",
      "item/commandExecution/outputDelta",
      "turn/completed",
      "error",
      "item/started",
      "item/completed",
      "codex/event/item_started",
      "codex/event/item_completed",
      "codex/event/agent_reasoning",
      "codex/event/agent_reasoning_delta",
      "codex/event/agent_reasoning_section_break",
      "item/reasoning/summaryTextDelta",
      "item/reasoning/summaryPartAdded",
      "codex/event/reasoning_content_delta",
      "codex/event/exec_command_begin",
      "codex/event/exec_command_end",
    ]);

    if (!known.has(method)) {
      logger.debug("ignored app-server notification", { method });
    }
  });

  controlAppServer.on("needs-restart", async ({ code, signal }) => {
    await persistRuntime({
      appServerStatus: "restarting",
      lastError: {
        at: nowIso(),
        message: `control app-server exited code=${code} signal=${signal}`,
      },
    });

    try {
      await controlAppServer.start();
      await persistRuntime({ appServerStatus: "ready" });
    } catch (error) {
      await persistRuntime({
        appServerStatus: "down",
        lastError: {
          at: nowIso(),
          message: redactText(error?.message || String(error), secrets),
        },
      });
    }
  });

  await controlAppServer.start();

  if (runtime.activeThreadId) {
    try {
      const resumed = await controlAppServer.resumeThread(runtime.activeThreadId);
      await persistRuntime({
        appServerStatus: "ready",
        activeThreadId: resumed?.id || runtime.activeThreadId,
      });
    } catch {
      const thread = await controlAppServer.startThread();
      await persistRuntime({
        appServerStatus: "ready",
        activeThreadId: thread?.id || null,
      });
    }
  } else {
    const thread = await controlAppServer.startThread();
    await persistRuntime({
      appServerStatus: "ready",
      activeThreadId: thread?.id || null,
    });
  }

  await persistRuntime({
    activeTaskId: null,
    activeTurnId: null,
    activeTaskStartedAt: null,
    activeTaskIds: [],
    activeTaskCount: 0,
    queueLength: 0,
  });

  const client = await createDiscordClient(cfg, logger);

  async function ensureControlThread() {
    if (runtime.activeThreadId) return runtime.activeThreadId;
    const thread = await controlAppServer.startThread();
    const threadId = thread?.id || null;
    await persistRuntime({ activeThreadId: threadId });
    return threadId;
  }

  function resolveRunningTaskContext(requestedTaskId) {
    if (requestedTaskId) {
      const ctx = activeTaskContexts.get(requestedTaskId);
      return { taskId: requestedTaskId, context: ctx || null };
    }

    const activeTaskId = runtime.activeTaskId
      || (Array.isArray(runtime.activeTaskIds) ? runtime.activeTaskIds[0] : null)
      || queue.active?.[0]?.taskId
      || null;

    if (!activeTaskId) {
      return { taskId: null, context: null };
    }

    return { taskId: activeTaskId, context: activeTaskContexts.get(activeTaskId) || null };
  }

  async function submitTask(prompt, source) {
    const inputText = String(prompt || "").trim();
    if (!inputText) {
      await source.send("❌ 输入不能为空");
      return null;
    }

    const taskId = createTaskId();
    const preferredThreadId = cfg.taskThreadMode === "shared"
      ? (runtime.activeThreadId || await ensureControlThread())
      : null;

    const taskBase = {
      taskId,
      sourceType: source.sourceType,
      sourceMessageId: source.messageId || null,
      sourceInteractionId: source.interactionId || null,
      userId: source.userId,
      channelId: source.channelId,
      inputText,
      threadId: preferredThreadId,
      createdAt: nowIso(),
    };

    await appendTaskEvent(cfg, {
      ...taskBase,
      status: "queued",
    }, secrets);

    const ackText = `${cfg.ackMessage} #${taskId}`;
    const ackMessage = await source.ack(ackText);

    const runPromise = queue.enqueue({ taskId }, async () => {
      const startedAt = nowIso();
      const isolated = cfg.taskThreadMode !== "shared";
      const taskAppServer = isolated ? new CodexAppServerClient(cfg, logger) : controlAppServer;

      let taskThreadId = preferredThreadId;
      let liveText = "";
      let commandText = "";
      let lastRendered = "";
      let streamTimer = null;
      let turnId = null;

      const taskContext = {
        taskId,
        appServer: taskAppServer,
        threadId: taskThreadId,
        turnId,
        startedAt,
      };

      const flushStream = async (force = false) => {
        const rendered = buildLiveText(taskId, liveText, commandText, cfg.minStreamPreviewChars);
        if (!force && rendered === lastRendered) return;
        lastRendered = rendered;

        try {
          await ackMessage.edit(rendered);
        } catch {
        }
      };

      const scheduleStreamFlush = () => {
        if (streamTimer) return;
        streamTimer = setTimeout(async () => {
          streamTimer = null;
          await flushStream(false);
        }, cfg.streamUpdateIntervalMs);
      };

      try {
        if (isolated) {
          await taskAppServer.start();
        }

        if (taskThreadId) {
          try {
            const resumed = await taskAppServer.resumeThread(taskThreadId);
            taskThreadId = resumed?.id || taskThreadId;
          } catch {
            const thread = await taskAppServer.startThread();
            taskThreadId = thread?.id || null;
          }
        } else {
          const thread = await taskAppServer.startThread();
          taskThreadId = thread?.id || null;
        }

        if (!taskThreadId) {
          throw new Error("failed to allocate task thread");
        }

        taskContext.threadId = taskThreadId;
        activeTaskContexts.set(taskId, taskContext);

        await appendTaskEvent(cfg, {
          ...taskBase,
          threadId: taskThreadId,
          status: "running",
          startedAt,
        }, secrets);

        const result = await taskAppServer.runTurn({
          threadId: taskThreadId,
          inputText,
          timeoutMs: cfg.turnTimeoutMs,
          onTurnStarted: async (newTurnId) => {
            turnId = newTurnId;
            taskContext.turnId = newTurnId;

            if (runtime.activeTaskId === taskId) {
              await persistRuntime({
                activeTurnId: newTurnId,
                activeTaskId: taskId,
                activeTaskStartedAt: startedAt,
              });
            }
          },
          onDelta: (_delta, totalText) => {
            liveText = totalText;
            scheduleStreamFlush();
          },
          onCommandDelta: (_delta, totalCmdText) => {
            commandText = totalCmdText;
            scheduleStreamFlush();
          },
        });

        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }

        await flushStream(true);

        const interrupted = result.status === "interrupted" || cancelRequestedTaskIds.has(taskId);
        const finalStatus = interrupted ? "cancelled" : result.status === "failed" ? "failed" : "success";

        const finalOutput = liveText || result.textOutput || "(empty response)";
        const chunks = splitDiscordMessage(finalOutput, 1900);

        const finalHeader = finalStatus === "success"
          ? `✅ #${taskId} 完成`
          : finalStatus === "cancelled"
            ? `🛑 #${taskId} 已取消`
            : `❌ #${taskId} 失败`;

        await ackMessage.edit(`${finalHeader}\n\n${chunks[0]}`);
        for (const chunk of chunks.slice(1)) {
          await source.send(chunk);
        }

        await appendTaskEvent(cfg, {
          ...taskBase,
          threadId: result.threadId || taskThreadId,
          turnId: result.turnId || turnId,
          status: finalStatus,
          completedAt: nowIso(),
          outputSummary: finalOutput.slice(0, 500),
        }, secrets);

        if (cancelRequestedTaskIds.has(taskId)) {
          cancelRequestedTaskIds.delete(taskId);
        }
      } catch (error) {
        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }

        const redactedError = redactText(error?.message || String(error), secrets);
        const cancelled = cancelRequestedTaskIds.has(taskId) || /interrupt/i.test(redactedError);
        const finalStatus = cancelled ? "cancelled" : "failed";

        await replyChunks(
          async (content) => ackMessage.edit(content),
          `${finalStatus === "cancelled" ? "🛑" : "❌"} #${taskId} ${finalStatus}\n${redactedError}`
        );

        await appendTaskEvent(cfg, {
          ...taskBase,
          threadId: taskThreadId,
          turnId,
          status: finalStatus,
          completedAt: nowIso(),
          errorCode: finalStatus === "cancelled" ? "INTERRUPTED" : "RUNTIME_ERROR",
          errorMessage: redactedError,
        }, secrets);

        if (cancelRequestedTaskIds.has(taskId)) {
          cancelRequestedTaskIds.delete(taskId);
        }

        await persistRuntime({
          lastError: {
            at: nowIso(),
            message: redactedError,
          },
        });
      } finally {
        activeTaskContexts.delete(taskId);

        if (isolated) {
          try {
            await taskAppServer.stop();
          } catch {
          }
        }
      }
    });

    void runPromise.catch((error) => {
      logger.error("task execution promise rejected", {
        taskId,
        error: redactText(error?.message || String(error), secrets),
      });
    });

    return { taskId, queued: true };
  }

  client.once("clientReady", async () => {
    await persistRuntime({ discordStatus: "ready" });

    try {
      const slashResult = await registerSlashCommands(client, cfg, logger);
      logger.info("slash commands registered", slashResult);
    } catch (error) {
      logger.error("slash registration failed", {
        error: error?.message || String(error),
      });
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const access = checkInteractionAccess(interaction, cfg);
    if (!access.allowed) {
      await interaction.reply({ content: "⛔ 仅 owner 私信可用", fetchReply: false });
      return;
    }

    try {
      if (interaction.commandName === COMMAND_NAMES.ask) {
        const prompt = interaction.options.getString("prompt", true);
        await submitTask(prompt, createInteractionSource(interaction));
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.newThread) {
        const thread = await controlAppServer.startThread();
        await persistRuntime({ activeThreadId: thread?.id || null });
        await interaction.reply({
          content: `🧵 已创建新 thread: ${thread?.id || "(unknown)"}`,
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.thread) {
        const threadId = interaction.options.getString("id", true).trim();
        const thread = await controlAppServer.resumeThread(threadId);
        await persistRuntime({ activeThreadId: thread?.id || threadId });
        await interaction.reply({
          content: `🧵 已切换到 thread: ${thread?.id || threadId}`,
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.threads) {
        const limit = interaction.options.getInteger("limit") || 10;
        const threads = await controlAppServer.listThreads(limit);
        if (!threads.length) {
          await interaction.reply({ content: "暂无 thread 记录", fetchReply: false });
          return;
        }

        const lines = ["🧵 最近 threads:"];
        threads.forEach((item, index) => {
          lines.push(`${index + 1}. ${formatThreadPreview(item)}`);
        });

        await interaction.reply({ content: lines.join("\n"), fetchReply: false });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.history) {
        const limit = interaction.options.getInteger("limit") || cfg.historyDefaultLimit;
        const snapshots = await listRecentTaskSnapshots(cfg, { limit });
        const source = createInteractionSource(interaction);
        await replyChunks(async (content) => source.send(content), buildHistoryText(snapshots));
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.recall) {
        const limit = interaction.options.getInteger("limit") || cfg.recallDefaultLimit;
        const snapshots = await listRecentTaskSnapshots(cfg, { limit });
        if (!snapshots.length) {
          await interaction.reply({ content: "暂无可回填的历史任务", fetchReply: false });
          return;
        }

        const source = createInteractionSource(interaction);
        const ack = await source.ack(`🧠 正在回填历史记忆（${snapshots.length} 条）...`);

        const threadId = await ensureControlThread();
        const recallPrompt = buildRecallPrompt(snapshots);

        try {
          const result = await controlAppServer.runTurn({
            threadId,
            inputText: recallPrompt,
            timeoutMs: Math.min(cfg.turnTimeoutMs, 180000),
          });

          const tail = compactText(result.textOutput || "", 120);
          const extra = tail ? `\n回执: ${tail}` : "";
          await ack.edit(`✅ 已回填 ${snapshots.length} 条历史到当前 thread (${threadId})${extra}`);
        } catch (error) {
          const redacted = redactText(error?.message || String(error), secrets);
          await ack.edit(`❌ 历史回填失败: ${redacted}`);
        }

        return;
      }

      if (interaction.commandName === COMMAND_NAMES.status) {
        await interaction.reply({
          content: buildStatusText(runtime, queue),
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.stop) {
        const requestedTaskId = (interaction.options.getString("task_id") || "").trim() || null;
        const { taskId, context } = resolveRunningTaskContext(requestedTaskId);

        if (!taskId || !context) {
          await interaction.reply({ content: "当前没有运行中的匹配任务", fetchReply: false });
          return;
        }

        if (!context.turnId || !context.threadId) {
          await interaction.reply({
            content: `任务 ${taskId} 尚未进入可中断阶段，请稍后再试`,
            fetchReply: false,
          });
          return;
        }

        cancelRequestedTaskIds.add(taskId);
        await context.appServer.interruptTurn(context.threadId, context.turnId);
        await interaction.reply({
          content: `🛑 已发送中断请求（task=${taskId}, turn=${context.turnId}）`,
          fetchReply: false,
        });
        return;
      }

      await interaction.reply({ content: "未知命令", fetchReply: false });
    } catch (error) {
      const redacted = redactText(error?.message || String(error), secrets);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `❌ ${redacted}`, fetchReply: false });
      } else {
        await interaction.followUp({ content: `❌ ${redacted}`, fetchReply: false });
      }
    }
  });

  client.on("messageCreate", async (message) => {
    const access = checkMessageAccess(message, cfg);
    if (!access.allowed) return;
    if (!cfg.allowPlainTextDm) return;

    const content = String(message.content || "").trim();
    if (!content) return;

    try {
      await submitTask(content, createMessageSource(message));
    } catch (error) {
      const redacted = redactText(error?.message || String(error), secrets);
      await message.reply(`❌ ${redacted}`);
    }
  });

  await client.login(cfg.discordToken);

  async function gracefulShutdown(signal) {
    logger.info("shutdown signal received", { signal });
    await persistRuntime({ discordStatus: "down", appServerStatus: "down" });

    const isolatedServers = new Set();
    for (const context of activeTaskContexts.values()) {
      if (context.appServer && context.appServer !== controlAppServer) {
        isolatedServers.add(context.appServer);
      }
    }

    for (const server of isolatedServers) {
      try {
        await server.stop();
      } catch {
      }
    }

    await controlAppServer.stop();
    await client.destroy();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error("fatal error", error);
  process.exit(1);
});

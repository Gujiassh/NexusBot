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

function buildStatusText(runtime, queue) {
  const lines = [
    "📊 Bridge Status",
    `- app-server: ${runtime.appServerStatus || "unknown"}`,
    `- discord: ${runtime.discordStatus || "unknown"}`,
    `- thread: ${runtime.activeThreadId || "(none)"}`,
    `- running task: ${runtime.activeTaskId || "(none)"}`,
    `- running turn: ${runtime.activeTurnId || "(none)"}`,
    `- queue length: ${queue.size}`,
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

  const persistRuntime = async (patch = {}) => {
    runtime = {
      ...runtime,
      ...patch,
      updatedAt: nowIso(),
    };
    runtime = await saveRuntimeState(cfg, runtime);
    return runtime;
  };

  const queue = new TaskQueue({
    onStateChange: async ({ queueLength, activeTask }) => {
      const patch = { queueLength };
      if (!activeTask) {
        if (!runtime.activeTurnId) {
          patch.activeTaskId = null;
          patch.activeTaskStartedAt = null;
        }
      }
      await persistRuntime(patch);
    },
  });

  const appServer = new CodexAppServerClient(cfg, logger);
  let cancelRequestedTaskId = null;

  appServer.on("notification", (notification) => {
    const method = notification?.method;
    if (!method) return;
    const known = new Set([
      "turn/started",
      "item/agentMessage/delta",
      "item/commandExecution/outputDelta",
      "turn/completed",
      "error",
    ]);
    if (!known.has(method)) {
      logger.debug("ignored app-server notification", { method });
    }
  });

  appServer.on("needs-restart", async ({ code, signal }) => {
    await persistRuntime({
      appServerStatus: "restarting",
      lastError: {
        at: nowIso(),
        message: `app-server exited code=${code} signal=${signal}`,
      },
    });

    try {
      await appServer.start();
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

  await appServer.start();

  if (runtime.activeThreadId) {
    try {
      const resumed = await appServer.resumeThread(runtime.activeThreadId);
      await persistRuntime({
        appServerStatus: "ready",
        activeThreadId: resumed?.id || runtime.activeThreadId,
      });
    } catch {
      const thread = await appServer.startThread();
      await persistRuntime({
        appServerStatus: "ready",
        activeThreadId: thread?.id || null,
      });
    }
  } else {
    const thread = await appServer.startThread();
    await persistRuntime({
      appServerStatus: "ready",
      activeThreadId: thread?.id || null,
    });
  }

  const client = await createDiscordClient(cfg, logger);

  async function submitTask(prompt, source) {
    const inputText = String(prompt || "").trim();
    if (!inputText) {
      await source.send("❌ 输入不能为空");
      return;
    }

    if (!runtime.activeThreadId) {
      const thread = await appServer.startThread();
      await persistRuntime({ activeThreadId: thread?.id || null });
    }

    const taskId = createTaskId();
    const taskBase = {
      taskId,
      sourceType: source.sourceType,
      sourceMessageId: source.messageId || null,
      sourceInteractionId: source.interactionId || null,
      userId: source.userId,
      channelId: source.channelId,
      inputText,
      threadId: runtime.activeThreadId,
      createdAt: nowIso(),
    };

    await appendTaskEvent(cfg, {
      ...taskBase,
      status: "queued",
    }, secrets);

    const ackText = `${cfg.ackMessage} #${taskId}`;
    const ackMessage = await source.ack(ackText);

    return queue.enqueue({ taskId }, async () => {
      await persistRuntime({
        activeTaskId: taskId,
        activeTaskStartedAt: nowIso(),
      });

      await appendTaskEvent(cfg, {
        ...taskBase,
        status: "running",
        startedAt: nowIso(),
      }, secrets);

      let liveText = "";
      let commandText = "";
      let lastRendered = "";
      let streamTimer = null;

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
        const result = await appServer.runTurn({
          threadId: runtime.activeThreadId,
          inputText,
          timeoutMs: cfg.turnTimeoutMs,
          onTurnStarted: async (turnId) => {
            await persistRuntime({
              activeTurnId: turnId,
              activeTaskId: taskId,
              activeTaskStartedAt: runtime.activeTaskStartedAt || nowIso(),
            });
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

        const interrupted = result.status === "interrupted" || cancelRequestedTaskId === taskId;
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
          threadId: result.threadId || runtime.activeThreadId,
          turnId: result.turnId || null,
          status: finalStatus,
          completedAt: nowIso(),
          outputSummary: finalOutput.slice(0, 500),
        }, secrets);

        if (cancelRequestedTaskId === taskId) {
          cancelRequestedTaskId = null;
        }

        await persistRuntime({
          activeTurnId: null,
          activeTaskId: null,
          activeTaskStartedAt: null,
          lastError: finalStatus === "failed"
            ? { at: nowIso(), message: `task ${taskId} failed` }
            : runtime.lastError,
        });
      } catch (error) {
        if (streamTimer) {
          clearTimeout(streamTimer);
        }

        const redactedError = redactText(error?.message || String(error), secrets);
        const cancelled = cancelRequestedTaskId === taskId || /interrupt/i.test(redactedError);
        const finalStatus = cancelled ? "cancelled" : "failed";

        await replyChunks(
          async (content) => ackMessage.edit(content),
          `${finalStatus === "cancelled" ? "🛑" : "❌"} #${taskId} ${finalStatus}\n${redactedError}`
        );

        await appendTaskEvent(cfg, {
          ...taskBase,
          status: finalStatus,
          completedAt: nowIso(),
          errorCode: finalStatus === "cancelled" ? "INTERRUPTED" : "RUNTIME_ERROR",
          errorMessage: redactedError,
        }, secrets);

        if (cancelRequestedTaskId === taskId) {
          cancelRequestedTaskId = null;
        }

        await persistRuntime({
          activeTurnId: null,
          activeTaskId: null,
          activeTaskStartedAt: null,
          lastError: {
            at: nowIso(),
            message: redactedError,
          },
        });
      }
    });
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
        const thread = await appServer.startThread();
        await persistRuntime({ activeThreadId: thread?.id || null });
        await interaction.reply({
          content: `🧵 已创建新 thread: ${thread?.id || "(unknown)"}`,
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.thread) {
        const threadId = interaction.options.getString("id", true).trim();
        const thread = await appServer.resumeThread(threadId);
        await persistRuntime({ activeThreadId: thread?.id || threadId });
        await interaction.reply({
          content: `🧵 已切换到 thread: ${thread?.id || threadId}`,
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.threads) {
        const limit = interaction.options.getInteger("limit") || 10;
        const threads = await appServer.listThreads(limit);
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

      if (interaction.commandName === COMMAND_NAMES.status) {
        await interaction.reply({
          content: buildStatusText(runtime, queue),
          fetchReply: false,
        });
        return;
      }

      if (interaction.commandName === COMMAND_NAMES.stop) {
        if (!runtime.activeTurnId || !runtime.activeThreadId) {
          await interaction.reply({ content: "当前没有运行中的任务", fetchReply: false });
          return;
        }

        cancelRequestedTaskId = runtime.activeTaskId || null;
        await appServer.interruptTurn(runtime.activeThreadId, runtime.activeTurnId);
        await interaction.reply({
          content: `🛑 已发送中断请求（task=${runtime.activeTaskId || "unknown"}）`,
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
    await appServer.stop();
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

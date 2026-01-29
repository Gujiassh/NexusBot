import "dotenv/config";
import process from "node:process";
import crypto from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import { extractPrompt, hasCommandPrefix, usageMessage } from "./commands/codexCommand.js";
import { runCodex } from "./services/codexRunner.js";
import { runAgentsSdk, runApprovalCheck } from "./services/agentsRunner.js";
import { loadConfig, updateConfigFile } from "./services/config.js";
import { checkAllowlist, createDiscordClient } from "./services/discordClient.js";
import { appendApproval, appendImportant, appendMemory, appendRejection } from "./services/memoryStore.js";
import { findSessionById, listSessions } from "./services/sessions.js";
import { registerSlashCommands } from "./services/slashCommands.js";
import { acquireInstanceLock } from "./services/instanceLock.js";
import { loadThreadStore, saveThreadStore } from "./services/threadStore.js";
import { listSkills } from "./services/skillList.js";
import { splitDiscordMessage } from "./utils/messageChunker.js";
import { collectSecrets, redactText } from "./utils/redact.js";
import { decideTaskRoute } from "./services/taskRouter.js";
import { startCodexSweeper } from "./services/processSweeper.js";
import {
  createScheduler,
  loadSchedules,
  parseInterval,
  formatInterval,
} from "./services/scheduler.js";
import { startMessageServer } from "./services/messageServer.js";

async function main() {
  const cfg = await loadConfig();
  const approvalRules = buildApprovalRules(cfg);
  const approvalAllowlist = buildApprovalAllowlist(cfg);
  await acquireInstanceLock(cfg);
  const client = createDiscordClient(cfg);
  const secrets = collectSecrets(cfg);
  const agentThreads = await loadThreadStore(cfg.agentsThreadsFile);
  const userSessions = await loadThreadStore(cfg.userSessionsFile);
  const schedules = await loadSchedules(cfg.schedulesFile);
  const scheduler = createScheduler(client, cfg, schedules);
  startCodexSweeper(cfg);

  const queue = [];
  const pendingApprovals = new Map();
  const activeRuns = new Map();
  let reconnecting = false;
  let lastDisconnectAt;

  function extractImportantNote(content) {
    if (!content) return null;
    const trimmed = content.trim();
    const candidates = [];
    if (hasCommandPrefix(trimmed, cfg.commandPrefix)) {
      const afterPrefix = trimmed.slice(cfg.commandPrefix.length).trim();
      candidates.push(afterPrefix);
    }
    candidates.push(trimmed);

    for (const candidate of candidates) {
      for (const keyword of cfg.importantKeywords || []) {
        if (!keyword) continue;
        if (candidate.startsWith(keyword)) {
          let note = candidate.slice(keyword.length).trim();
          note = note.replace(/^[:：\-—]+/, "").trim();
          return { keyword, note };
        }
      }
    }
    return null;
  }

  function shouldAutoReply(message) {
    const isDm = message.guildId == null;
    if (isDm) return cfg.autoReplyInDm;
    if (cfg.autoReplyInChannels) return true;
    if (cfg.mentionReplyInChannels && isBotMention(message)) return true;
    return false;
  }

  function isBotMention(message) {
    if (!message || !client.user) return false;
    try {
      return Boolean(message.mentions?.has?.(client.user));
    } catch {
      return false;
    }
  }

  function stripBotMention(content) {
    if (!content || !client.user) return content || "";
    const id = client.user.id;
    const pattern = new RegExp(`<@!?${id}>`, "g");
    return String(content).replace(pattern, "").trim();
  }

  function formatTimestamp(value, fallbackMs) {
    const fromValue = value ? new Date(value) : null;
    if (fromValue && !Number.isNaN(fromValue.valueOf())) {
      return fromValue.toISOString().replace("T", " ").replace("Z", "Z");
    }
    if (fallbackMs) {
      const fromMs = new Date(fallbackMs);
      if (!Number.isNaN(fromMs.valueOf())) {
        return fromMs.toISOString().replace("T", " ").replace("Z", "Z");
      }
    }
    return "unknown";
  }

  function formatSessionLine(session, index) {
    const id = session.id || "(unknown)";
    const ts = formatTimestamp(session.timestamp, session.mtimeMs);
    const cwd = session.cwd || "-";
    return `${index + 1}) ${id} | ${ts} | ${cwd}`;
  }

  function shouldForceTask(prompt) {
    const text = String(prompt || "");
    if (!text) return false;
    if (cfg.taskRoutingMinChars && text.length >= cfg.taskRoutingMinChars) return true;
    const lower = text.toLowerCase();
    for (const keyword of cfg.taskRoutingKeywords || []) {
      if (!keyword) continue;
      if (lower.includes(String(keyword).toLowerCase())) return true;
    }
    return false;
  }

  function checkDenylist(prompt) {
    const text = String(prompt || "");
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const keyword of cfg.safetyDenylistKeywords || []) {
      if (!keyword) continue;
      const k = String(keyword).toLowerCase();
      if (k && lower.includes(k)) {
        return keyword;
      }
    }
    return null;
  }

  function buildApprovalComponents(requestId, disabled = false) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approval:approve:${requestId}`)
          .setLabel("批准")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`approval:reject:${requestId}`)
          .setLabel("拒绝")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled)
      ),
    ];
  }

  function isOwnerMessage(message) {
    const ownerIds = Array.isArray(cfg.ownerUserIds) ? cfg.ownerUserIds : [];
    if (!ownerIds.length) return false;
    return message?.author?.id && ownerIds.includes(message.author.id);
  }

  function isSlashCommandMessage(message) {
    return typeof message?.content === "string" && message.content.trim().startsWith("/");
  }

  function shorten(text, max = 200) {
    const raw = String(text || "");
    if (!raw) return "";
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max)}…`;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter(Boolean);
  }

  function compilePatterns(patterns) {
    const compiled = [];
    for (const rawPattern of patterns || []) {
      if (!rawPattern) continue;
      const pattern = String(rawPattern);
      if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
        const lastSlash = pattern.lastIndexOf("/");
        const body = pattern.slice(1, lastSlash);
        const flags = pattern.slice(lastSlash + 1) || "i";
        try {
          compiled.push({ raw: pattern, regex: new RegExp(body, flags) });
          continue;
        } catch {
          // fall through to literal match
        }
      }
      compiled.push({ raw: pattern, literal: pattern.toLowerCase() });
    }
    return compiled;
  }

  function matchCompiledPatterns(text, compiled) {
    const raw = String(text || "");
    if (!raw) return null;
    const lower = raw.toLowerCase();
    for (const entry of compiled || []) {
      if (entry.regex) {
        if (entry.regex.test(raw)) return entry.raw;
      } else if (entry.literal) {
        if (lower.includes(entry.literal)) return entry.raw;
      }
    }
    return null;
  }

  function buildApprovalRules(cfg) {
    const defaults = {
      commandKeywords: [
        "ls",
        "cat",
        "rm",
        "mv",
        "cp",
        "chmod",
        "chown",
        "sudo",
        "curl",
        "wget",
        "ssh",
        "scp",
        "git",
        "docker",
        "ps",
        "kill",
        "pkill",
        "systemctl",
        "service",
        "nohup",
        "bash",
        "sh",
        "python",
        "node",
      ],
      pathPatterns: [
        "/(^|\\s)(~\\/|\\.\\/|\\.\\.\\/|\\/|[A-Za-z]:\\\\|\\\\\\\\)/",
      ],
      denyPatterns: [],
    };
    const raw = cfg?.approvalRules && typeof cfg.approvalRules === "object"
      ? cfg.approvalRules
      : {};
    const commandKeywords =
      raw.commandKeywords === undefined
        ? defaults.commandKeywords
        : asStringArray(raw.commandKeywords);
    const pathPatterns =
      raw.pathPatterns === undefined
        ? defaults.pathPatterns
        : asStringArray(raw.pathPatterns);
    const denyPatterns =
      raw.denyPatterns === undefined
        ? defaults.denyPatterns
        : asStringArray(raw.denyPatterns);
    const commandRegex =
      commandKeywords.length > 0
        ? new RegExp(
            `\\b(?:${commandKeywords.map(escapeRegExp).join("|")})\\b`,
            "i"
          )
        : null;
    return {
      commandKeywords,
      commandRegex,
      pathPatterns: compilePatterns(pathPatterns),
      denyPatterns: compilePatterns(denyPatterns),
    };
  }

  function buildApprovalAllowlist(cfg) {
    return {
      userIds: asStringArray(cfg?.approvalAllowlistUserIds),
      roleIds: asStringArray(cfg?.approvalAllowlistRoleIds),
      channelIds: asStringArray(cfg?.approvalAllowlistChannelIds),
      guildIds: asStringArray(cfg?.approvalAllowlistGuildIds),
      patterns: compilePatterns(asStringArray(cfg?.approvalAllowlistPatterns)),
    };
  }

  function extractRoleIds(member) {
    if (!member) return [];
    const roles = member.roles;
    if (!roles) return [];
    if (Array.isArray(roles)) {
      return roles
        .map((role) => (typeof role === "string" ? role : role?.id))
        .filter(Boolean);
    }
    if (roles.cache && typeof roles.cache.keys === "function") {
      return Array.from(roles.cache.keys());
    }
    return [];
  }

  function isApprovalWhitelisted(actor, prompt) {
    if (!actor) return null;
    const authorId = actor?.author?.id;
    if (authorId && approvalAllowlist.userIds.includes(authorId)) {
      return `user:${authorId}`;
    }
    const channelId = actor?.channelId;
    if (channelId && approvalAllowlist.channelIds.includes(channelId)) {
      return `channel:${channelId}`;
    }
    const guildId = actor?.guildId;
    if (guildId && approvalAllowlist.guildIds.includes(guildId)) {
      return `guild:${guildId}`;
    }
    const roleIds = extractRoleIds(actor?.member);
    if (roleIds.some((roleId) => approvalAllowlist.roleIds.includes(roleId))) {
      return "role";
    }
    const patternMatch = matchCompiledPatterns(prompt, approvalAllowlist.patterns);
    if (patternMatch) {
      return `pattern:${patternMatch}`;
    }
    return null;
  }

  function matchCommandKeyword(text) {
    if (!approvalRules.commandRegex) return null;
    const match = String(text || "").match(approvalRules.commandRegex);
    return match ? match[0] : null;
  }

  function localRiskCheck(prompt, { isCommand, isImportant } = {}) {
    const reasons = [];
    if (isCommand) reasons.push("command");
    if (isImportant) reasons.push("important");
    const text = String(prompt || "");
    const denyMatch = matchCompiledPatterns(text, approvalRules.denyPatterns);
    if (denyMatch) {
      reasons.push(`rule:deny:${denyMatch}`);
    }
    const pathMatch = matchCompiledPatterns(text, approvalRules.pathPatterns);
    const commandMatch = matchCommandKeyword(text);
    if (pathMatch || commandMatch) {
      reasons.push("file_or_command");
      if (commandMatch) {
        reasons.push(`rule:command:${commandMatch}`);
      }
      if (pathMatch) {
        reasons.push("rule:path");
      }
    }
    return { needsApproval: reasons.length > 0, reasons, evidence: shorten(text) };
  }

  async function evaluateRisk(prompt, { isCommand, isImportant, actor } = {}) {
    const denyMatch = checkDenylist(prompt);
    if (denyMatch) {
      return {
        needsApproval: true,
        reasons: [`denylist:${denyMatch}`],
        evidence: shorten(prompt),
        forceReject: cfg.safetyDenylistReject === true,
      };
    }
    const allowMatch = isApprovalWhitelisted(actor, prompt);
    if (allowMatch) {
      return {
        needsApproval: false,
        reasons: [`allowlist:${allowMatch}`],
        evidence: shorten(prompt),
      };
    }
    const base = localRiskCheck(prompt, { isCommand, isImportant });
    if (base.needsApproval || !cfg.approvalUseModel) return base;
    try {
      const ai = await runApprovalCheck(cfg, prompt);
      if (ai.needsApproval) {
        return {
          needsApproval: true,
          reasons: [ai.reason ? `model:${ai.reason}` : "model"],
          evidence: ai.highlight ? shorten(ai.highlight) : base.evidence,
        };
      }
    } catch (err) {
      console.warn("approval model check failed", err?.message || err);
      return {
        needsApproval: true,
        reasons: ["model_error"],
        evidence: base.evidence,
      };
    }
    return base;
  }

  async function sendOwnerNotice(messageText, components) {
    const ownerIds = Array.isArray(cfg.ownerUserIds) ? cfg.ownerUserIds : [];
    if (!ownerIds.length) return;
    let notified = false;
    if (cfg.adminChannelId) {
      try {
        const channel = await client.channels.fetch(cfg.adminChannelId);
        if (channel?.isTextBased()) {
          const sent = await channel.send({ content: messageText, components });
          notified = true;
          return sent;
        }
      } catch (err) {
        console.warn("notify owner channel failed", err?.message || err);
      }
    }
    if (!notified) {
      for (const ownerId of ownerIds) {
        try {
          const ownerUser = await client.users.fetch(ownerId);
          const sent = await ownerUser.send({ content: messageText, components });
          if (sent) return sent;
        } catch (err) {
          console.warn("notify owner dm failed", err?.message || err);
        }
      }
    }
    return null;
  }

  async function requestOwnerApproval({ message, prompt, kind, reasons, evidence }) {
    const requestId = crypto.randomUUID();
    const safeReasons = Array.isArray(reasons) ? reasons : [];
    const entry = {
      id: requestId,
      ts: new Date().toISOString(),
      status: "pending",
      reasons: safeReasons,
      evidence,
      kind,
      discord: {
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        content: message.content,
      },
    };
    const isDm = message.guildId == null;
    const channelInfo = isDm ? "DM" : `channel:${message.channelId}`;
    const noticeLines = [
      "审批请求",
      `id: ${requestId}`,
      `user: ${message.author?.tag || message.author?.id} (${message.author?.id})`,
      `where: ${channelInfo}`,
      `content: ${message.content}`,
      `操作: ${cfg.commandPrefix} approve ${requestId} / ${cfg.commandPrefix} reject ${requestId}`,
    ].filter(Boolean);
    if (isDm) {
      noticeLines.push(`私聊提醒: 用户id：${message.author?.id} 请求：${message.content}`);
    }
    const ownerNotice = noticeLines.join("\n");
    const noticeMessage = await sendOwnerNotice(
      ownerNotice,
      buildApprovalComponents(requestId)
    );

    pendingApprovals.set(requestId, {
      request: entry,
      message,
      prompt,
      receivedAt: entry.ts,
      approvalMessage: noticeMessage
        ? { channelId: noticeMessage.channelId, messageId: noticeMessage.id }
        : null,
    });
    await appendApproval(cfg, entry);

    try {
      await message.reply({ content: "已提交给主人审核，请稍等。" });
    } catch {
      // ignore
    }
  }

  async function updateApprovalNotice(record, status, decidedBy) {
    const ref = record?.approvalMessage;
    if (!ref) return;
    try {
      const channel = await client.channels.fetch(ref.channelId);
      if (!channel?.isTextBased()) return;
      const msg = await channel.messages.fetch(ref.messageId);
      const suffix = `\n状态: ${status}${decidedBy ? ` by ${decidedBy}` : ""}`;
      const content = msg.content.includes("状态:")
        ? msg.content
        : `${msg.content}${suffix}`;
      await msg.edit({
        content,
        components: buildApprovalComponents(record.request.id, true),
      });
    } catch (err) {
      console.warn("update approval notice failed", err?.message || err);
    }
  }

  async function executeApprovedRecord(record, decisionBy) {
    if (!record?.request) return;
    const kind = record.request.kind || "prompt";
    if (kind === "command") {
      try {
        await handleBotCommand(record.message, record.prompt, { approved: true });
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        try {
          await record.message.reply({ content: `command error: ${errorText}` });
        } catch {
          // ignore
        }
      }
      return;
    }
    if (kind === "important") {
      const importantMatch = extractImportantNote(record.message?.content || "");
      if (!importantMatch || !importantMatch.note) {
        try {
          await record.message.reply({ content: "未能解析重要内容，请重新发送（记住/记一下/记录）" });
        } catch {
          // ignore
        }
        return;
      }
      const entry = {
        ts: new Date().toISOString(),
        keyword: importantMatch.keyword,
        note: importantMatch.note,
        discord: {
          channelId: record.message.channelId,
          messageId: record.message.id,
          authorId: record.message.author?.id,
          authorTag: record.message.author?.tag,
          content: record.message.content,
        },
      };
      await appendImportant(cfg, entry);
      try {
        await record.message.reply({ content: cfg.importantReply });
      } catch {
        // ignore
      }
      return;
    }

    queue.push({
      message: record.message,
      prompt: record.prompt,
      receivedAt: record.receivedAt,
      ackedAt: new Date().toISOString(),
      kind: record.request?.kind || "prompt",
      taskId: record.request?.taskId,
    });
    processQueue();
  }

  async function finalizeApproval(record, decision, decidedBy) {
    const logEntry = {
      ...record.request,
      status: decision,
      decidedAt: new Date().toISOString(),
      decidedBy,
    };
    await appendApproval(cfg, logEntry);
    await updateApprovalNotice(record, decision, decidedBy);

    if (decision !== "approved") {
      try {
        await record.message.reply({ content: "主人已拒绝该请求。" });
      } catch {
        // ignore
      }
      return;
    }

    await executeApprovedRecord(record, decidedBy);
  }

  function buildInteractionAdapter(interaction, prompt, deferred) {
    let responded = false;
    return {
      channel: interaction.channel,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      member: interaction.member,
      author: interaction.user,
      id: interaction.id,
      content: prompt,
      reply: async ({ content }) => {
        if (!responded) {
          if (deferred) {
            await interaction.editReply({ content });
          } else {
            await interaction.reply({ content });
          }
          responded = true;
          return;
        }
        await interaction.followUp({ content });
      },
    };
  }

  async function handleInteractionCommand(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;
    if (!["approvals", "compact", "skill", "skill-creator", "new", "resume", "fork"].includes(name)) return;

    if (!isOwnerMessage({ author: interaction.user })) {
      await interaction.reply({ content: "无权限", ephemeral: true });
      return;
    }

    if (name === "skill") {
      const skills = await listSkills();
      if (!skills.length) {
        await interaction.reply({ content: "未找到本地 skills。" });
        return;
      }
      const lines = skills.map(
        (skill) => `- ${skill.name}: ${skill.description} (${skill.path})`
      );
      const content = `Skills (${skills.length}):\n${lines.join("\n")}`;
      if (content.length > 1900) {
        await interaction.reply({ content: `Skills (${skills.length}) 列表过长，请在命令行查看。` });
      } else {
        await interaction.reply({ content });
      }
      return;
    }

    const prompt = name === "skill-creator" ? "$skill-creator" : `/${name}`;
    const allowResult = checkAllowlist(
      {
        content: prompt,
        author: interaction.user,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        member: interaction.member,
      },
      cfg
    );

    if (!allowResult.allowed) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "当前频道/用户未授权", ephemeral: true });
      }
      if (cfg.logRejections) {
        const entry = {
          ts: new Date().toISOString(),
          reason: allowResult.reason,
          commandPrefix: cfg.commandPrefix,
          kind: "slash-command",
          discord: {
            channelId: interaction.channelId,
            messageId: interaction.id,
            authorId: interaction.user?.id,
            authorTag: interaction.user?.tag,
            content: prompt,
          },
        };
        await appendRejection(cfg, entry);
      }
      return;
    }

    const adapter = buildInteractionAdapter(interaction, prompt, false);
    if (cfg.requireOwnerApproval && !isOwnerMessage(adapter)) {
      const { needsApproval, reasons, evidence, forceReject } = await evaluateRisk(prompt, {
        isCommand: true,
        actor: adapter,
      });
      if (needsApproval) {
        if (forceReject) {
          await interaction.reply({ content: "已拒绝：安全限制", ephemeral: true });
          return;
        }
        await requestOwnerApproval({
          message: adapter,
          prompt,
          kind: "slash-command",
          reasons,
          evidence,
        });
        return;
      }
    }

    let ackedAt;
    if (cfg.immediateAck) {
      try {
        await interaction.reply({ content: cfg.ackMessage });
        ackedAt = new Date().toISOString();
      } catch {
        ackedAt = undefined;
      }
    } else {
      try {
        await interaction.deferReply();
        ackedAt = new Date().toISOString();
      } catch {
        ackedAt = undefined;
      }
    }

    const adapterDeferred = buildInteractionAdapter(
      interaction,
      prompt,
      !cfg.immediateAck
    );
    queue.push({
      message: adapterDeferred,
      prompt,
      receivedAt: new Date().toISOString(),
      ackedAt,
      kind: "slash-command",
    });
    processQueue();
  }

  async function handleBotCommand(message, commandText, options = {}) {
    const trimmed = (commandText || "").trim();
    if (!trimmed) {
      await message.reply({ content: usageMessage(cfg.commandPrefix) });
      return true;
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const verb = (parts[0] || "").toLowerCase();
    if (verb === "owners") {
      if (!isOwnerMessage(message) && !options.approved) {
        await message.reply({ content: "无权限" });
        return true;
      }
      const owners = Array.isArray(cfg.ownerUserIds) ? cfg.ownerUserIds : [];
      if (!owners.length) {
        await message.reply({ content: "当前没有主人配置。" });
        return true;
      }
      await message.reply({
        content: `当前主人列表：\n${owners.join("\n")}`,
      });
      return true;
    }
    if (verb === "owner") {
      if (!isOwnerMessage(message) && !options.approved) {
        await message.reply({ content: "无权限" });
        return true;
      }
      const action = (parts[1] || "").toLowerCase();
      const targetId = parts[2];
      if (!action || !targetId) {
        await message.reply({ content: "用法: !codex owner add <id> / !codex owner remove <id>" });
        return true;
      }
      const owners = new Set(Array.isArray(cfg.ownerUserIds) ? cfg.ownerUserIds : []);
      if (action === "add") {
        owners.add(targetId);
      } else if (action === "remove") {
        owners.delete(targetId);
      } else {
        await message.reply({ content: "用法: !codex owner add <id> / !codex owner remove <id>" });
        return true;
      }
      const nextOwners = [...owners];
      await updateConfigFile({ ownerUserIds: nextOwners });
      cfg.ownerUserIds = nextOwners;
      await message.reply({ content: `已更新主人列表：\n${nextOwners.join("\n")}` });
      return true;
    }
    if (verb === "task") {
      if (!isOwnerMessage(message) && !options.approved) {
        await message.reply({ content: "无权限" });
        return true;
      }
      const taskPrompt = parts.slice(1).join(" ").trim();
      if (!taskPrompt) {
        await message.reply({ content: `用法: ${cfg.commandPrefix} task <任务内容>` });
        return true;
      }
      const taskId = crypto.randomUUID().slice(0, 8);
      const receivedAt = new Date().toISOString();
      queue.push({
        message,
        prompt: taskPrompt,
        receivedAt,
        ackedAt: receivedAt,
        kind: "task",
        taskId,
      });
      processQueue();
      await message.reply({ content: `任务已派发：${taskId}` });
      return true;
    }
    if (verb === "schedule") {
      if (!isOwnerMessage(message) && !options.approved) {
        await message.reply({ content: "无权限" });
        return true;
      }
      const action = (parts[1] || "").toLowerCase();
      if (action === "list") {
        const items = scheduler.list();
        if (!items.length) {
          await message.reply({ content: "当前没有定时消息。" });
          return true;
        }
        const lines = items.map((item) => {
          const interval = formatInterval(item.intervalMs || 0);
          const preview = String(item.message || "").slice(0, 60);
          return `${item.id} | ${item.channelId} | ${interval} | ${preview}`;
        });
        for (const chunk of splitDiscordMessage(lines.join("\n"))) {
          await message.reply({ content: chunk });
        }
        return true;
      }
      if (action === "remove") {
        const id = parts[2];
        if (!id) {
          await message.reply({ content: `用法: ${cfg.commandPrefix} schedule remove <id>` });
          return true;
        }
        const ok = await scheduler.remove(id);
        await message.reply({ content: ok ? `已移除 ${id}` : "未找到该定时任务" });
        return true;
      }
      if (action === "add") {
        const channelArg = parts[2];
        const intervalArg = parts[3];
        const messageText = parts.slice(4).join(" ").trim();
        if (!channelArg || !intervalArg || !messageText) {
          await message.reply({
            content: `用法: ${cfg.commandPrefix} schedule add <channelId|here> <interval> <message>`,
          });
          return true;
        }
        const channelId =
          channelArg === "here"
            ? message.channelId
            : channelArg.replace(/[<#>]/g, "");
        if (!channelId || channelId.length < 5) {
          await message.reply({ content: "channelId 无效" });
          return true;
        }
        const intervalMs = parseInterval(intervalArg);
        if (!intervalMs) {
          await message.reply({ content: "interval 格式不对，示例：10m / 1h / 30s" });
          return true;
        }
        const id = crypto.randomUUID().slice(0, 8);
        await scheduler.add({
          id,
          channelId,
          intervalMs,
          message: messageText,
        });
        await message.reply({
          content: `已创建定时消息 ${id}（${formatInterval(intervalMs)}）`,
        });
        return true;
      }
      await message.reply({
        content: `用法: ${cfg.commandPrefix} schedule add <channelId|here> <interval> <message>`,
      });
      return true;
    }
    if (verb === "pending") {
      if (!isOwnerMessage(message)) {
        await message.reply({ content: "无权限" });
        return true;
      }
      if (!pendingApprovals.size) {
        await message.reply({ content: "当前没有待审批请求。" });
        return true;
      }
      const lines = [];
      for (const [id, record] of pendingApprovals.entries()) {
        const requester = record?.request?.discord?.authorTag || record?.request?.discord?.authorId;
        const content = record?.request?.discord?.content
          ? shorten(record.request.discord.content, 80)
          : "-";
        lines.push(`${id} | ${requester} | ${content}`);
      }
      for (const chunk of splitDiscordMessage(lines.join("\n"))) {
        await message.reply({ content: chunk });
      }
      return true;
    }
    if (verb === "approve" || verb === "reject") {
      if (!isOwnerMessage(message)) {
        await message.reply({ content: "无权限" });
        return true;
      }
      const id = parts[1];
      if (!id || !pendingApprovals.has(id)) {
        await message.reply({ content: "未找到待审批请求" });
        return true;
      }
      const record = pendingApprovals.get(id);
      pendingApprovals.delete(id);
      const decision = verb === "approve" ? "approved" : "rejected";
      await finalizeApproval(record, decision, message.author?.id);
      await message.reply({ content: decision === "approved" ? `已批准 ${id}` : `已拒绝 ${id}` });
      return true;
    }
    if (verb === "sessions") {
      let limitOverride;
      if (parts[1]) {
        const parsed = Number(parts[1]);
        if (!Number.isNaN(parsed) && parsed > 0) limitOverride = Math.min(parsed, 50);
      }
      const { sessions, total } = await listSessions(cfg, limitOverride);
      if (!sessions.length) {
        await message.reply({
          content: `未找到会话（sessionsDir=${cfg.sessionsDir}）`,
        });
        return true;
      }
      const header = `当前会话: ${cfg.codexSessionId}\n最近 ${sessions.length}/${total} 个会话：`;
      const body = sessions.map(formatSessionLine).join("\n");
      const footer = `\n用法：${cfg.commandPrefix} session <id|last>`;
      for (const chunk of splitDiscordMessage(`${header}\n${body}${footer}`)) {
        await message.reply({ content: chunk });
      }
      return true;
    }
    if (verb === "session") {
      if (!parts[1]) {
        await message.reply({
          content: `当前会话: ${cfg.codexSessionId}\n用法：${cfg.commandPrefix} session <id|last>`,
        });
        return true;
      }
      const requested = parts[1].trim();
      if (!requested) {
        await message.reply({
          content: `当前会话: ${cfg.codexSessionId}\n用法：${cfg.commandPrefix} session <id|last>`,
        });
        return true;
      }
      let found = null;
      if (requested.toLowerCase() !== "last") {
        const { sessions } = await listSessions(cfg, Math.max(cfg.sessionsLimit, 50));
        found = findSessionById(sessions, requested);
      }
      try {
        await updateConfigFile({ codexSessionId: requested });
        cfg.codexSessionId = requested;
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        await message.reply({ content: `更新配置失败: ${errorText}` });
        return true;
      }
      const envOverride = process.env.CODEX_SESSION_ID;
      const suffix = envOverride
        ? "（注意：检测到 CODEX_SESSION_ID 环境变量，可能覆盖配置文件）"
        : found
        ? ""
        : "（未在最近会话里找到，仍然已设置；若无效会话，codex 会报错）";
      await message.reply({ content: `已切换到会话 ${requested}${suffix}` });
      return true;
    }
    return false;
  }

  function getSessionKey(message) {
    if (!cfg.perUserSessions) return "default";
    if (!message?.author?.id) return "default";
    if (message.guildId == null) return message.author.id;
    return `${message.channelId}:${message.author.id}`;
  }

  function getRunKey(message, kind, taskId) {
    if (kind === "task" && taskId) {
      return `task:${message.channelId || message.author?.id || "unknown"}:${taskId}`;
    }
    if (cfg.perUserSessions && message?.author?.id) {
      return getSessionKey(message);
    }
    return message.channelId || message.author?.id || "unknown";
  }

  async function runJob(job) {
    const { message, prompt, receivedAt, ackedAt, kind, taskId } = job;
    const runKey = getRunKey(message, kind, taskId);
    activeRuns.set(runKey, (activeRuns.get(runKey) || 0) + 1);
    if (cfg.sendTyping) {
      try {
        await message.channel.sendTyping();
      } catch {
        // ignore
      }
    }

    const sanitizedPrompt = redactText(prompt, secrets);
    const sanitizedContent = redactText(message.content, secrets);
    const sessionKey = getSessionKey(message);
    let sessionIdForRun = cfg.codexSessionId;
    let modeForRun = kind === "task" ? "new" : "resume";
    let captureSession = false;
    if (kind === "task") {
      sessionIdForRun = undefined;
    }
    if (!cfg.useAgentsSdk && cfg.perUserSessions && kind !== "task") {
      const mapped = userSessions[sessionKey];
      if (mapped) {
        sessionIdForRun = mapped;
      } else {
        sessionIdForRun = undefined;
        modeForRun = "new";
        captureSession = true;
      }
    }
    const baseEntry = {
      ts: receivedAt,
      timing: {
        receivedAt,
        ackedAt,
      },
      discord: {
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: sanitizedContent,
      },
      codex: {
        sessionId: sessionIdForRun || cfg.codexSessionId,
        prompt: sanitizedPrompt,
      },
    };

    try {
      const threadKey = message.channelId || message.author?.id;
      const result = cfg.useAgentsSdk
        ? await runAgentsSdk(cfg, prompt, {
            threadId: threadKey ? agentThreads[threadKey] : undefined,
          })
        : await runCodex(cfg, prompt, {
            mode: modeForRun,
            sessionId: sessionIdForRun,
            captureSession,
          });
      if (result.exitCode !== 0) {
        const detail = result.stderr || result.stdout || `codex exited ${result.exitCode}`;
        throw new Error(detail.trim());
      }
      if (cfg.useAgentsSdk && result.threadId && threadKey) {
        agentThreads[threadKey] = result.threadId;
        await saveThreadStore(cfg.agentsThreadsFile, agentThreads);
      }
      if (!cfg.useAgentsSdk && captureSession && result.sessionId) {
        userSessions[sessionKey] = result.sessionId;
        await saveThreadStore(cfg.userSessionsFile, userSessions);
      }
      const responseText = redactText(result.responseText || "(no response)", secrets);
      const respondedAt = new Date().toISOString();
      const entry = {
        ...baseEntry,
        codex: {
          ...baseEntry.codex,
          runId: result.runId,
          threadId: result.threadId || undefined,
          provider: cfg.useAgentsSdk ? "agents-sdk" : "codex-cli",
          kind: kind || "prompt",
          taskId: taskId || undefined,
          sessionId: result.sessionId || baseEntry.codex.sessionId,
        },
        timing: {
          ...baseEntry.timing,
          respondedAt,
        },
        result: {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        },
      };

      await appendMemory(cfg, entry, responseText);

      const finalText =
        kind === "task" && taskId
          ? `任务 ${taskId} 完成：\n${responseText}`
          : responseText;
      for (const chunk of splitDiscordMessage(finalText)) {
        await message.reply({ content: chunk });
      }
    } catch (err) {
      const errorText = redactText(
        err instanceof Error ? err.message : String(err),
        secrets
      );
      const entry = {
        ...baseEntry,
        timing: {
          ...baseEntry.timing,
          respondedAt: new Date().toISOString(),
        },
        error: errorText,
      };

      await appendMemory(cfg, entry, "");

      try {
        const replyText = cfg.replyOnError ? `codex error: ${errorText}` : "codex error";
        for (const chunk of splitDiscordMessage(replyText)) {
          await message.reply({ content: chunk });
        }
      } catch {
        // ignore
      }
    } finally {
      const nextCount = (activeRuns.get(runKey) || 1) - 1;
      if (nextCount <= 0) {
        activeRuns.delete(runKey);
      } else {
        activeRuns.set(runKey, nextCount);
      }
      processQueue();
    }
  }

  function processQueue() {
    const maxTaskRuns = cfg.maxConcurrentRuns || 1;
    if (queue.length === 0) return;
    const taskCount = [...activeRuns.keys()].filter((key) => key.startsWith("task:")).length;

    let pickedIndex = -1;
    for (let i = 0; i < queue.length; i += 1) {
      const candidate = queue[i];
      if (candidate.kind === "task") continue;
      const key = getRunKey(candidate.message, candidate.kind, candidate.taskId);
      if (!activeRuns.has(key)) {
        pickedIndex = i;
        break;
      }
    }
    if (pickedIndex === -1) {
      if (taskCount >= maxTaskRuns) return;
      for (let i = 0; i < queue.length; i += 1) {
        const candidate = queue[i];
        const key = getRunKey(candidate.message, candidate.kind, candidate.taskId);
        if (!activeRuns.has(key)) {
          pickedIndex = i;
          break;
        }
      }
    }
    if (pickedIndex === -1) return;

    const [job] = queue.splice(pickedIndex, 1);
    void runJob(job);
    if (queue.length > 0) {
      processQueue();
    }
  }

  client.on("messageCreate", async (message) => {
    const cleanedContent = stripBotMention(message.content);
    const isCommand = hasCommandPrefix(cleanedContent, cfg.commandPrefix);
    const importantMatch = extractImportantNote(cleanedContent);
    const isSlashLike = cleanedContent.trim().startsWith("/");
    const isMention = isBotMention(message);
    if (!isCommand && !importantMatch && !shouldAutoReply(message)) return;

    const allowResult = checkAllowlist(message, cfg);
    if (!allowResult.allowed) {
      if (allowResult.reason === "empty_content") {
        try {
          await message.reply({ content: "未收到消息内容，请在 Discord 开发者后台开启 Message Content Intent" });
        } catch {
          // ignore
        }
      }
      if (cfg.logRejections) {
        const entry = {
          ts: new Date().toISOString(),
          reason: allowResult.reason,
          commandPrefix: cfg.commandPrefix,
          kind: isCommand ? "command" : importantMatch ? "important" : "auto-reply",
          discord: {
            channelId: message.channelId,
            messageId: message.id,
            authorId: message.author.id,
            authorTag: message.author.tag,
            content: message.content,
          },
        };
        await appendRejection(cfg, entry);
      }
      return;
    }

    if ((isCommand || importantMatch || isSlashLike) && !isOwnerMessage(message)) {
      try {
        await message.reply({ content: "无权限" });
      } catch {
        // ignore
      }
      return;
    }

    if (importantMatch) {
      if (!importantMatch.note) {
        await message.reply({ content: "请在关键词后输入要记录的内容" });
        return;
      }
      const entry = {
        ts: new Date().toISOString(),
        keyword: importantMatch.keyword,
        note: importantMatch.note,
        discord: {
          channelId: message.channelId,
          messageId: message.id,
          authorId: message.author.id,
          authorTag: message.author.tag,
          content: message.content,
        },
      };
      if (cfg.requireOwnerApproval && !isOwnerMessage(message)) {
        const { needsApproval, reasons, evidence, forceReject } = await evaluateRisk(
          message.content,
          {
            isCommand: true,
            isImportant: true,
            actor: message,
          }
        );
        if (needsApproval) {
          if (forceReject) {
            await message.reply({ content: "已拒绝：安全限制" });
            return;
          }
          await requestOwnerApproval({
            message,
            prompt: message.content,
            kind: "important",
            reasons,
            evidence,
          });
          return;
        }
      }
      await appendImportant(cfg, entry);
      await message.reply({ content: cfg.importantReply });
      return;
    }

    const receivedAt = new Date().toISOString();
    const prompt = isCommand
      ? extractPrompt(cleanedContent, cfg.commandPrefix)
      : cleanedContent.trim();

    if (cfg.requireOwnerApproval && !isOwnerMessage(message)) {
      const { needsApproval, reasons, evidence, forceReject } = await evaluateRisk(prompt, {
        isCommand: isCommand || isSlashCommandMessage(message),
        isImportant: false,
        actor: message,
      });
      if (needsApproval) {
        if (forceReject) {
          await message.reply({ content: "已拒绝：安全限制" });
          return;
        }
        await requestOwnerApproval({
          message,
          prompt,
          kind: isCommand ? "command" : "prompt",
          reasons,
          evidence,
        });
        return;
      }
    }
    if (isCommand) {
      try {
        const handled = await handleBotCommand(message, prompt);
        if (handled) return;
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        await message.reply({ content: `command error: ${errorText}` });
        return;
      }
    }
    if (!prompt) {
      if (isMention) {
        await message.reply({ content: "在的，请直接说需求。" });
        return;
      }
      await message.reply({ content: usageMessage(cfg.commandPrefix) });
      return;
    }
    let routedKind = isCommand ? "command" : "prompt";
    let taskId;
    if (!isCommand && !importantMatch && cfg.autoTaskRouting) {
      try {
        const forceTask = shouldForceTask(prompt);
        const route = forceTask ? { route: "task", reason: "rule" } : await decideTaskRoute(cfg, prompt);
        if (route.route === "task") {
          routedKind = "task";
          taskId = crypto.randomUUID().slice(0, 8);
          await message.reply({ content: `任务已派发：${taskId}` });
        }
      } catch (err) {
        console.warn("auto task routing failed", err?.message || err);
      }
    }
    let ackedAt;
    if (cfg.immediateAck) {
      try {
        await message.reply({ content: cfg.ackMessage });
        ackedAt = new Date().toISOString();
      } catch {
        ackedAt = undefined;
      }
    }
    queue.push({ message, prompt, receivedAt, ackedAt, kind: routedKind, taskId });
    processQueue();
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        const customId = interaction.customId || "";
        if (!customId.startsWith("approval:")) return;
        const [, action, requestId] = customId.split(":");
        if (!isOwnerMessage({ author: interaction.user })) {
          await interaction.reply({ content: "无权限", ephemeral: true });
          return;
        }
        if (!pendingApprovals.has(requestId)) {
          await interaction.reply({ content: "审批已处理或不存在", ephemeral: true });
          return;
        }
        await interaction.deferUpdate();
        const record = pendingApprovals.get(requestId);
        pendingApprovals.delete(requestId);
        const decision = action === "approve" ? "approved" : "rejected";
        await finalizeApproval(record, decision, interaction.user?.id);
        return;
      }
      await handleInteractionCommand(interaction);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `command error: ${errorText}`, ephemeral: true });
      }
    }
  });

  async function reconnectIfNeeded() {
    if (reconnecting) return;
    if (client.isReady()) return;
    if (!lastDisconnectAt) return;
    const elapsed = Date.now() - lastDisconnectAt;
    if (elapsed < cfg.reconnectTimeoutMs) return;
    reconnecting = true;
    try {
      console.warn("discord reconnect watchdog: forcing re-login");
      try {
        await client.destroy();
      } catch {
        // ignore
      }
      await client.login(cfg.discordToken);
      lastDisconnectAt = undefined;
    } finally {
      reconnecting = false;
    }
  }

  client.on("shardDisconnect", () => {
    lastDisconnectAt = Date.now();
  });

  client.on("shardResume", () => {
    lastDisconnectAt = undefined;
  });

  client.once("ready", async () => {
    try {
      const result = await registerSlashCommands(client, cfg);
      if (result?.registered) {
        console.log(`slash commands registered (${result.scope})`);
      }
      scheduler.startAll();
      startMessageServer(client, cfg);
    } catch (err) {
      console.warn("slash command registration failed", err?.message || err);
    }
  });

  setInterval(() => {
    reconnectIfNeeded().catch((err) => console.error("reconnect failed", err));
  }, cfg.reconnectIntervalMs).unref?.();

  process.on("SIGINT", async () => {
    try {
      await client.destroy();
    } finally {
      process.exit(0);
    }
  });

  await client.login(cfg.discordToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "node:fs/promises";
import path from "node:path";
import { collectSecrets, redactText } from "../utils/redact.js";

const RETRYABLE_ERRORS = new Set(["EAGAIN", "EBUSY", "EMFILE", "ENFILE", "ETIMEDOUT"]);

async function appendWithRetry(filePath, content, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.appendFile(filePath, content, "utf8");
      return true;
    } catch (err) {
      lastError = err;
      if (!RETRYABLE_ERRORS.has(err.code)) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (i + 1)));
    }
  }
  console.error(`memory write failed for ${filePath}`, lastError?.message || lastError);
  return false;
}

export async function appendMemory(cfg, entry, responseText) {
  await fs.mkdir(cfg.memoryDir, { recursive: true });
  const jsonlPath = path.join(cfg.memoryDir, cfg.memoryJsonl);
  const mdPath = path.join(cfg.memoryDir, cfg.memoryMarkdown);
  const secrets = collectSecrets(cfg);

  const safePrompt = redactText(entry?.codex?.prompt || "", secrets);
  const safeResponse = redactText(responseText || "", secrets);
  const safeError = entry?.error ? redactText(entry.error, secrets) : undefined;

  const jsonRecord = {
    ...entry,
    codex: {
      ...entry.codex,
      prompt: safePrompt,
      response: safeResponse,
    },
    ...(safeError ? { error: safeError } : {}),
  };

  const mdLines = [
    `## ${entry.ts}`,
    `- discord.user: ${entry.discord.authorTag} (${entry.discord.authorId})`,
    `- discord.channel: ${entry.discord.channelId}`,
    `- discord.messageId: ${entry.discord.messageId}`,
    "",
    "### prompt",
    safePrompt || "(empty)",
    "",
    "### response",
    safeResponse || "(empty)",
    "",
  ];

  const jsonOk = await appendWithRetry(jsonlPath, `${JSON.stringify(jsonRecord)}\n`);
  const mdOk = await appendWithRetry(mdPath, `${mdLines.join("\n")}\n`);

  if (!jsonOk || !mdOk) {
    console.error("memory write incomplete", { jsonOk, mdOk });
  }
}

export async function appendRejection(cfg, entry) {
  await fs.mkdir(cfg.memoryDir, { recursive: true });
  const logPath = path.join(cfg.memoryDir, cfg.rejectionLog || "rejections.jsonl");
  const secrets = collectSecrets(cfg);
  const safeEntry = {
    ...entry,
    discord: {
      ...entry.discord,
      content: redactText(entry?.discord?.content || "", secrets),
    },
  };
  await appendWithRetry(logPath, `${JSON.stringify(safeEntry)}\n`);
}

export async function appendImportant(cfg, entry) {
  await fs.mkdir(cfg.memoryDir, { recursive: true });
  const jsonlPath = path.join(cfg.memoryDir, cfg.importantJsonl || "important.jsonl");
  const mdPath = path.join(cfg.memoryDir, cfg.importantMarkdown || "important.md");
  const secrets = collectSecrets(cfg);

  const safeNote = redactText(entry?.note || "", secrets);
  const safeContent = redactText(entry?.discord?.content || "", secrets);

  const jsonRecord = {
    ...entry,
    note: safeNote,
    discord: {
      ...entry.discord,
      content: safeContent,
    },
  };

  const mdLines = [
    `## ${entry.ts}`,
    `- keyword: ${entry.keyword}`,
    `- discord.user: ${entry.discord.authorTag} (${entry.discord.authorId})`,
    `- discord.channel: ${entry.discord.channelId}`,
    `- discord.messageId: ${entry.discord.messageId}`,
    "",
    "### note",
    safeNote || "(empty)",
    "",
  ];

  const jsonOk = await appendWithRetry(jsonlPath, `${JSON.stringify(jsonRecord)}\n`);
  const mdOk = await appendWithRetry(mdPath, `${mdLines.join("\n")}\n`);

  if (!jsonOk || !mdOk) {
    console.error("important memory write incomplete", { jsonOk, mdOk });
  }
}

export async function appendApproval(cfg, entry) {
  await fs.mkdir(cfg.memoryDir, { recursive: true });
  const logPath = path.join(cfg.memoryDir, cfg.approvalsLog || "approvals.jsonl");
  const secrets = collectSecrets(cfg);
  const safeEntry = {
    ...entry,
    discord: {
      ...entry.discord,
      content: redactText(entry?.discord?.content || "", secrets),
    },
  };
  await appendWithRetry(logPath, `${JSON.stringify(safeEntry)}\n`);
}

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROUTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: { type: "string", enum: ["chat", "task"] },
    reason: { type: "string" },
  },
  required: ["route"],
};

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // ignore
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // ignore
    }
  }
  return null;
}

export async function decideTaskRoute(cfg, userMessage) {
  const prompt = String(userMessage || "").trim();
  if (!prompt) {
    return { route: "chat", reason: "empty" };
  }
  const runId = crypto.randomUUID();
  const schemaPath = path.join(os.tmpdir(), `codex-task-schema-${runId}.json`);
  const outputPath = path.join(os.tmpdir(), `codex-task-out-${runId}.txt`);
  await fs.writeFile(schemaPath, JSON.stringify(ROUTE_SCHEMA, null, 2), "utf8");

  const routerPrompt = [
    "You are a router. Decide if the user message should be handled as a background task.",
    "Task = long-running, multi-step, or requires tools/commands or heavy processing.",
    "Chat = short answer, discussion, or simple question.",
    "Return JSON ONLY: {\"route\":\"task|chat\",\"reason\":\"short\"}.",
    "",
    `Message: """${prompt}"""`,
  ].join("\n");

  const args = [
    "exec",
    "--json",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-a",
    "never",
    "--sandbox",
    "read-only",
    ...(cfg.codexArgs || []),
    routerPrompt,
  ];

  const child = spawn("codex", args, {
    cwd: cfg.codexCwd,
    env: {
      ...process.env,
      CODEX_BRIDGE: "1",
      CODEX_BRIDGE_RUN_ID: runId,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const timeoutMs = Number(cfg.taskRoutingTimeoutMs || 15000);
  const timeout = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }, timeoutMs);

  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
  clearTimeout(timeout);

  let raw = "";
  try {
    raw = await fs.readFile(outputPath, "utf8");
  } catch {
    raw = "";
  }

  const parsed = extractJson(raw) || extractJson(stdout);
  const route = parsed?.route === "task" ? "task" : "chat";
  const reason = parsed?.reason ? String(parsed.reason) : "";

  try {
    await fs.unlink(schemaPath);
  } catch {
    // ignore
  }
  try {
    await fs.unlink(outputPath);
  } catch {
    // ignore
  }

  return { route, reason, exitCode, stderr };
}

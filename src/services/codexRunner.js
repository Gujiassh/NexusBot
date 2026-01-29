import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listSessions } from "./sessions.js";

function extractAgentMessage(raw) {
  if (!raw) return "";
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastText = "";
  let sawJson = false;
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    sawJson = true;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === "item.completed" && parsed?.item?.type === "agent_message") {
        if (parsed.item.text) lastText = parsed.item.text;
      } else if (parsed?.type === "response.output_text.done" && parsed?.text) {
        lastText = parsed.text;
      } else if (parsed?.type === "assistant_message" && parsed?.text) {
        lastText = parsed.text;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  if (lastText) return lastText;
  if (sawJson) return "";
  return raw;
}

function extractSessionId(raw) {
  if (!raw) return "";
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === "session_meta" && parsed?.payload?.id) {
        return String(parsed.payload.id);
      }
      if (parsed?.type === "thread.started" && parsed?.thread_id) {
        return String(parsed.thread_id);
      }
      if (parsed?.type === "session.started" && parsed?.session_id) {
        return String(parsed.session_id);
      }
    } catch {
      // ignore
    }
  }
  return "";
}

export async function runCodex(cfg, prompt, options = {}) {
  const runId = crypto.randomUUID();
  await fs.mkdir(cfg.memoryDir, { recursive: true });
  const outputFile = path.join(cfg.memoryDir, `last_message_${runId}.txt`);
  const mode = options.mode || "resume";
  const sessionIdRaw = options.sessionId ?? cfg.codexSessionId;
  const sessionId = String(sessionIdRaw || "").trim();
  const useLast = sessionId.toLowerCase() === "last";

  let beforeNewest = null;
  if (options.captureSession) {
    try {
      const { sessions } = await listSessions(cfg, 1);
      beforeNewest = sessions[0] || null;
    } catch {
      beforeNewest = null;
    }
  }

  const args = [
    "exec",
    "--json",
    "--output-last-message",
    outputFile,
    ...cfg.codexArgs,
  ];
  if (mode === "resume") {
    args.push("resume", ...(useLast ? ["--last"] : [sessionId]));
  }
  args.push(prompt);

  const startedAt = Date.now();
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

  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });

  let responseText = "";
  try {
    responseText = (await fs.readFile(outputFile, "utf8")).trim();
  } catch {
    responseText = "";
  }

  const extractedFromFile = extractAgentMessage(responseText);
  if (extractedFromFile) {
    responseText = extractedFromFile;
  } else {
    const extractedFromStdout = extractAgentMessage(stdout);
    if (extractedFromStdout) {
      responseText = extractedFromStdout;
    } else if (!responseText && stdout.trim()) {
      responseText = stdout.trim();
    }
  }

  let resolvedSessionId = extractSessionId(stdout);
  if (!resolvedSessionId && options.captureSession) {
    try {
      const { sessions } = await listSessions(cfg, 3);
      const cutoff = beforeNewest?.mtimeMs ? beforeNewest.mtimeMs + 1 : 0;
      const candidate = sessions.find((session) => session.mtimeMs > cutoff);
      if (candidate?.id) resolvedSessionId = candidate.id;
    } catch {
      // ignore
    }
  }

  const durationMs = Date.now() - startedAt;
  return {
    runId,
    responseText,
    stdout,
    stderr,
    exitCode,
    durationMs,
    outputFile,
    sessionId: resolvedSessionId || (sessionId || undefined),
  };
}

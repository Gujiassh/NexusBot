import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

function extractJsonPayload(raw) {
  if (!raw) return null;
  const lines = String(raw)
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
  return null;
}

async function runAgentsSdkRaw(cfg, payload) {
  const runId = crypto.randomUUID();
  const python = cfg.agentsPython || "python3";
  const scriptPath = cfg.agentsScript
    ? path.resolve(cfg.agentsScript)
    : path.resolve(process.cwd(), "agents", "agents_runner.py");
  const startedAt = Date.now();
  const env = { ...process.env };
  if (cfg.agentsOpenaiApiKey) {
    env.OPENAI_API_KEY = cfg.agentsOpenaiApiKey;
  }
  if (cfg.agentsOpenaiBaseUrl) {
    env.OPENAI_BASE_URL = cfg.agentsOpenaiBaseUrl;
    env.OPENAI_API_BASE = cfg.agentsOpenaiBaseUrl;
  }
  if (cfg.agentsHttpProxy) {
    env.HTTP_PROXY = cfg.agentsHttpProxy;
    env.http_proxy = cfg.agentsHttpProxy;
  }
  if (cfg.agentsHttpsProxy) {
    env.HTTPS_PROXY = cfg.agentsHttpsProxy;
    env.https_proxy = cfg.agentsHttpsProxy;
  }
  if (cfg.agentsNoProxy) {
    env.NO_PROXY = cfg.agentsNoProxy;
    env.no_proxy = cfg.agentsNoProxy;
  }
  const child = spawn(python, [scriptPath], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(`${JSON.stringify(payload)}\n`);
  child.stdin.end();

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

  const durationMs = Date.now() - startedAt;
  const parsed = extractJsonPayload(stdout);
  const responseText = parsed?.text ? String(parsed.text) : stdout.trim();
  const threadId = parsed?.threadId ? String(parsed.threadId) : undefined;

  return {
    runId,
    responseText,
    stdout,
    stderr,
    exitCode,
    durationMs,
    threadId,
  };
}

export async function runAgentsSdk(cfg, prompt, context = {}) {
  const payload = {
    prompt,
    cwd: cfg.codexCwd,
    approval_policy: cfg.agentsApprovalPolicy || "never",
    sandbox: cfg.agentsSandbox || "workspace-write",
    base_instructions: cfg.agentsBaseInstructions || undefined,
    thread_id: context.threadId || undefined,
  };
  return runAgentsSdkRaw(cfg, payload);
}

export async function runApprovalCheck(cfg, prompt) {
  const payload = {
    mode: "approval_check",
    prompt,
  };
  const result = await runAgentsSdkRaw(cfg, payload);
  const parsed = extractJsonPayload(result.stdout) || {};
  const needsApproval = Boolean(
    parsed.needsApproval ?? parsed.needs_approval ?? parsed.needs ?? false
  );
  const reason = parsed.reason ? String(parsed.reason) : "";
  const highlight = parsed.highlight ? String(parsed.highlight) : "";
  return {
    ...result,
    needsApproval,
    reason,
    highlight,
  };
}

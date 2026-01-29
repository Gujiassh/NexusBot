import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function isBridgeProcess(pid) {
  try {
    const env = await fs.readFile(`/proc/${pid}/environ`, "utf8");
    return env.includes("CODEX_BRIDGE=1");
  } catch {
    return false;
  }
}

async function listCodexProcesses() {
  const { stdout } = await execAsync("ps -eo pid,etimes,command");
  const lines = stdout.trim().split(/\r?\n/).slice(1);
  const processes = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const etimes = Number(parts[1]);
    if (!pid || Number.isNaN(etimes)) continue;
    const command = parts.slice(2).join(" ");
    if (!/\\bcodex\\b/.test(command)) continue;
    processes.push({ pid, etimes, command });
  }
  return processes;
}

async function killIfExists(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGKILL");
  } catch {
    // already exited
  }
  return true;
}

export async function sweepCodexProcesses(cfg) {
  const maxAgeSec = Number(cfg.codexSweepMaxAgeSec || 10800);
  if (Number.isNaN(maxAgeSec) || maxAgeSec <= 0) return;
  const processes = await listCodexProcesses();
  let killed = 0;
  let total = 0;
  for (const proc of processes) {
    const isBridge = await isBridgeProcess(proc.pid);
    if (!isBridge) continue;
    total += 1;
    if (proc.etimes < maxAgeSec) continue;
    const didKill = await killIfExists(proc.pid);
    if (didKill) killed += 1;
  }
  if (total || killed) {
    console.warn(
      `codex sweep: bridge=${total} killed=${killed} maxAgeSec=${maxAgeSec}`
    );
  }
}

export function startCodexSweeper(cfg) {
  const intervalMs = Number(cfg.codexSweepIntervalMs || 10800000);
  if (Number.isNaN(intervalMs) || intervalMs <= 0) return;
  setTimeout(() => {
    sweepCodexProcesses(cfg).catch((err) => {
      console.warn("codex sweep failed", err?.message || err);
    });
  }, 30000);
  const timer = setInterval(() => {
    sweepCodexProcesses(cfg).catch((err) => {
      console.warn("codex sweep failed", err?.message || err);
    });
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

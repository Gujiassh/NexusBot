import fs from "node:fs/promises";
import path from "node:path";

const MIN_INTERVAL_MS = 60000;

export async function loadSchedules(filePath) {
  if (!filePath) return [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("schedule read failed", err?.message || err);
    }
  }
  return [];
}

export async function saveSchedules(filePath, schedules) {
  if (!filePath) return;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(schedules, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn("schedule write failed", err?.message || err);
  }
}

export function parseInterval(input) {
  if (!input) return null;
  const trimmed = String(input).trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2] || "m";
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const ms = value * (multipliers[unit] || multipliers.m);
  return Math.max(ms, MIN_INTERVAL_MS);
}

export function formatInterval(ms) {
  const sec = Math.round(ms / 1000);
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export function createScheduler(client, cfg, schedules = []) {
  const timers = new Map();

  async function sendMessage(entry) {
    try {
      const channel = await client.channels.fetch(entry.channelId);
      if (!channel?.isTextBased()) return;
      await channel.send({ content: entry.message });
    } catch (err) {
      console.warn("schedule send failed", err?.message || err);
    }
  }

  function startEntry(entry) {
    stopEntry(entry.id);
    const intervalMs = Math.max(entry.intervalMs || MIN_INTERVAL_MS, MIN_INTERVAL_MS);
    const timer = setInterval(() => {
      void sendMessage(entry);
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    timers.set(entry.id, timer);
  }

  function stopEntry(id) {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }
  }

  function startAll() {
    for (const entry of schedules) {
      if (!entry?.id || !entry.channelId || !entry.message) continue;
      startEntry(entry);
    }
  }

  async function add(entry) {
    schedules.push(entry);
    await saveSchedules(cfg.schedulesFile, schedules);
    startEntry(entry);
    return entry;
  }

  async function remove(id) {
    const idx = schedules.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    schedules.splice(idx, 1);
    await saveSchedules(cfg.schedulesFile, schedules);
    stopEntry(id);
    return true;
  }

  function list() {
    return schedules.slice();
  }

  return { startAll, add, remove, list, stopEntry };
}

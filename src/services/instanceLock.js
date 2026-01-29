import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    return true;
  }
}

async function writeLock(lockPath) {
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  await fsp.writeFile(lockPath, `${JSON.stringify(payload)}\n`, { flag: "wx" });
}

export async function acquireInstanceLock(cfg) {
  const lockPath =
    cfg.lockFile || path.join(os.tmpdir(), "nexusbot.lock");

  try {
    await writeLock(lockPath);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    let existing;
    try {
      existing = JSON.parse(await fsp.readFile(lockPath, "utf8"));
    } catch {
      existing = null;
    }
    if (existing?.pid && isProcessAlive(existing.pid)) {
      throw new Error(`instance already running (pid ${existing.pid})`);
    }
    try {
      await fsp.unlink(lockPath);
    } catch {
      // ignore
    }
    await writeLock(lockPath);
  }

  const cleanup = () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    console.error(err);
    cleanup();
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    console.error(err);
    cleanup();
    process.exit(1);
  });

  return lockPath;
}

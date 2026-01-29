import fs from "node:fs/promises";
import path from "node:path";

export async function loadThreadStore(filePath) {
  if (!filePath) return {};
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("thread store read failed", err?.message || err);
    }
  }
  return {};
}

export async function saveThreadStore(filePath, data) {
  if (!filePath) return;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn("thread store write failed", err?.message || err);
  }
}

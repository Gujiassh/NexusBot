#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const filePath = fileIndex >= 0 && args[fileIndex + 1] ? args[fileIndex + 1] : "memory/memory.jsonl";
const rejectIndex = args.indexOf("--rejections");
const rejectPath =
  rejectIndex >= 0 && args[rejectIndex + 1] ? args[rejectIndex + 1] : "memory/rejections.jsonl";
const resolved = path.resolve(process.cwd(), filePath);
const rejectResolved = path.resolve(process.cwd(), rejectPath);

if (!fs.existsSync(resolved)) {
  console.error(`metrics file not found: ${resolved}`);
  process.exit(1);
}

const lines = fs.readFileSync(resolved, "utf8").split("\n").filter(Boolean);
const rejectionLines = fs.existsSync(rejectResolved)
  ? fs.readFileSync(rejectResolved, "utf8").split("\n").filter(Boolean)
  : [];
let total = 0;
let success = 0;
let responseWithin30s = 0;
let responseSamples = 0;
let ackWithin5s = 0;
let ackSamples = 0;
let rejections = 0;

for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  total += 1;
  if (entry?.result?.exitCode === 0) success += 1;

  const receivedAt = Date.parse(entry?.timing?.receivedAt || "");
  const respondedAt = Date.parse(entry?.timing?.respondedAt || "");
  if (!Number.isNaN(receivedAt) && !Number.isNaN(respondedAt)) {
    responseSamples += 1;
    if (respondedAt - receivedAt <= 30000) responseWithin30s += 1;
  }

  const ackedAt = Date.parse(entry?.timing?.ackedAt || "");
  if (!Number.isNaN(receivedAt) && !Number.isNaN(ackedAt)) {
    ackSamples += 1;
    if (ackedAt - receivedAt <= 5000) ackWithin5s += 1;
  }
}

for (const line of rejectionLines) {
  try {
    JSON.parse(line);
    rejections += 1;
  } catch {
    continue;
  }
}

function percent(part, whole) {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const attempts = total + rejections;

console.log("Codex Discord Bridge Metrics");
console.log(`File: ${resolved}`);
console.log(`Total entries: ${total}`);
console.log(`Rejected commands: ${rejections} (${percent(rejections, attempts)})`);
console.log(`Success (exitCode=0): ${success} (${percent(success, total)})`);
console.log(`Responses <= 30s: ${responseWithin30s}/${responseSamples} (${percent(responseWithin30s, responseSamples)})`);
console.log(`ACK <= 5s: ${ackWithin5s}/${ackSamples} (${percent(ackWithin5s, ackSamples)})`);
console.log("Note: rejection rate uses memory.jsonl + rejections.jsonl.");

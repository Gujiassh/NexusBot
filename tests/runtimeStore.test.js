import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { appendTaskEvent, listRecentTaskSnapshots } from "../src/services/runtimeStore.js";

test("listRecentTaskSnapshots merges task lifecycle events", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bridge-runtime-store-"));
  const cfg = {
    tasksFile: path.join(root, "tasks.jsonl"),
  };

  await appendTaskEvent(cfg, {
    taskId: "T-1",
    status: "queued",
    inputText: "hello",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await appendTaskEvent(cfg, {
    taskId: "T-1",
    status: "success",
    outputSummary: "world",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
  });

  await appendTaskEvent(cfg, {
    taskId: "T-2",
    status: "failed",
    inputText: "bye",
    errorMessage: "boom",
    createdAt: "2026-01-02T00:00:00.000Z",
  });

  const list = await listRecentTaskSnapshots(cfg, { limit: 5 });
  assert.equal(list.length, 2);

  assert.equal(list[0].taskId, "T-2");
  assert.equal(list[0].status, "failed");

  assert.equal(list[1].taskId, "T-1");
  assert.equal(list[1].status, "success");
  assert.equal(list[1].outputSummary, "world");
});

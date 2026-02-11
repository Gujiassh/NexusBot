import test from "node:test";
import assert from "node:assert/strict";

import { TaskQueue } from "../src/services/taskQueue.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("TaskQueue runs up to configured concurrency", async () => {
  const queue = new TaskQueue({ concurrency: 2 });
  const started = [];

  const d1 = createDeferred();
  const d2 = createDeferred();

  const p1 = queue.enqueue({ taskId: "A" }, async () => {
    started.push("A");
    await d1.promise;
    return "done-A";
  });

  const p2 = queue.enqueue({ taskId: "B" }, async () => {
    started.push("B");
    await d2.promise;
    return "done-B";
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(started.length, 2);
  assert.equal(queue.activeCount, 2);

  d1.resolve();
  d2.resolve();

  assert.equal(await p1, "done-A");
  assert.equal(await p2, "done-B");
  assert.equal(queue.activeCount, 0);
});

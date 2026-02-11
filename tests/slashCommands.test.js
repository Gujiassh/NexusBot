import test from "node:test";
import assert from "node:assert/strict";

import { COMMAND_NAMES, SLASH_COMMAND_DATA } from "../src/commands/slashCommands.js";

function findCommand(name) {
  return SLASH_COMMAND_DATA.find((item) => item.name === name);
}

test("slash command set matches expected names", () => {
  const names = SLASH_COMMAND_DATA.map((item) => item.name).sort();
  const expected = [
    COMMAND_NAMES.ask,
    COMMAND_NAMES.newThread,
    COMMAND_NAMES.thread,
    COMMAND_NAMES.threads,
    COMMAND_NAMES.tasks,
    COMMAND_NAMES.status,
    COMMAND_NAMES.stop,
    COMMAND_NAMES.restart,
    COMMAND_NAMES.history,
    COMMAND_NAMES.recall,
  ].sort();

  assert.deepEqual(names, expected);
});

test("ask command has required prompt option", () => {
  const ask = findCommand(COMMAND_NAMES.ask);
  assert.ok(ask);
  assert.ok(Array.isArray(ask.options));

  const prompt = ask.options.find((opt) => opt.name === "prompt");
  assert.ok(prompt);
  assert.equal(prompt.required, true);
});

test("thread command has required id option", () => {
  const thread = findCommand(COMMAND_NAMES.thread);
  assert.ok(thread);

  const id = (thread.options || []).find((opt) => opt.name === "id");
  assert.ok(id);
  assert.equal(id.required, true);
});

test("threads command has bounded optional limit option", () => {
  const threads = findCommand(COMMAND_NAMES.threads);
  assert.ok(threads);

  const limit = (threads.options || []).find((opt) => opt.name === "limit");
  assert.ok(limit);
  assert.equal(limit.required, false);
  assert.equal(limit.min_value, 1);
  assert.equal(limit.max_value, 20);
});

test("tasks command has bounded optional limit option", () => {
  const tasks = findCommand(COMMAND_NAMES.tasks);
  assert.ok(tasks);

  const limit = (tasks.options || []).find((opt) => opt.name === "limit");
  assert.ok(limit);
  assert.equal(limit.required, false);
  assert.equal(limit.min_value, 1);
  assert.equal(limit.max_value, 20);
});

test("stop command supports optional task_id", () => {
  const stop = findCommand(COMMAND_NAMES.stop);
  assert.ok(stop);

  const taskId = (stop.options || []).find((opt) => opt.name === "task_id");
  assert.ok(taskId);
  assert.equal(taskId.required, false);
});

test("restart command has no options", () => {
  const restart = findCommand(COMMAND_NAMES.restart);
  assert.ok(restart);
  assert.ok(!restart.options || restart.options.length === 0);
});

test("history and recall commands support bounded limit", () => {
  for (const commandName of [COMMAND_NAMES.history, COMMAND_NAMES.recall]) {
    const command = findCommand(commandName);
    assert.ok(command);

    const limit = (command.options || []).find((opt) => opt.name === "limit");
    assert.ok(limit);
    assert.equal(limit.required, false);
    assert.equal(limit.min_value, 1);
    assert.equal(limit.max_value, 20);
  }
});

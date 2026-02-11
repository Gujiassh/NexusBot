export const COMMAND_NAMES = Object.freeze({
  ask: "ask",
  newThread: "new",
  thread: "thread",
  threads: "threads",
  tasks: "tasks",
  status: "status",
  stop: "stop",
  restart: "restart",
  history: "history",
  recall: "recall",
});

export const SLASH_COMMAND_DATA = [
  {
    name: COMMAND_NAMES.ask,
    description: "Ask Codex to run a task",
    type: 1,
    options: [
      {
        type: 3,
        name: "prompt",
        description: "Task prompt for Codex",
        required: true,
      },
    ],
  },
  {
    name: COMMAND_NAMES.newThread,
    description: "Create a new Codex thread",
    type: 1,
    options: [],
  },
  {
    name: COMMAND_NAMES.thread,
    description: "Resume and switch to a specific thread",
    type: 1,
    options: [
      {
        type: 3,
        name: "id",
        description: "Codex thread ID",
        required: true,
      },
    ],
  },
  {
    name: COMMAND_NAMES.threads,
    description: "List recent Codex threads",
    type: 1,
    options: [
      {
        type: 4,
        name: "limit",
        description: "Max threads to list (1-20)",
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: COMMAND_NAMES.tasks,
    description: "Show running and queued tasks",
    type: 1,
    options: [
      {
        type: 4,
        name: "limit",
        description: "Max queued/history records (1-20)",
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: COMMAND_NAMES.status,
    description: "Show bridge runtime status",
    type: 1,
    options: [],
  },
  {
    name: COMMAND_NAMES.stop,
    description: "Interrupt a running task (or current one)",
    type: 1,
    options: [
      {
        type: 3,
        name: "task_id",
        description: "Target task ID, e.g. T-...",
        required: false,
      },
    ],
  },
  {
    name: COMMAND_NAMES.restart,
    description: "Restart control app-server and reattach thread",
    type: 1,
    options: [],
  },
  {
    name: COMMAND_NAMES.history,
    description: "Show recent task history",
    type: 1,
    options: [
      {
        type: 4,
        name: "limit",
        description: "Max records to list (1-20)",
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: COMMAND_NAMES.recall,
    description: "Load recent task memory into current thread",
    type: 1,
    options: [
      {
        type: 4,
        name: "limit",
        description: "How many recent records to import (1-20)",
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
];

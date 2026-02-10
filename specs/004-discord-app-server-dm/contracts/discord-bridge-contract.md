# Contract: Discord Bridge v2 (Owner DM + Codex app-server)

## 1) Inbound Contract (Discord)

### Allowed context

- requester MUST equal configured `OWNER_USER_ID`
- context MUST be DM (`guildId == null`)

### Slash Commands

#### `/ask`

- Input: `prompt` (string, required, non-empty)
- Behavior: enqueue `BridgeTask`, ACK immediately, run via `turn/start`
- Output: streaming message updates + terminal status

#### `/new`

- Input: none
- Behavior: create thread via `thread/start`, set as active thread
- Output: new `threadId`

#### `/thread`

- Input: `id` (string, required)
- Behavior: resume target thread via `thread/resume`, set active thread
- Output: active thread confirmation

#### `/threads`

- Input: `limit` (int, optional, default 10)
- Behavior: call `thread/list`
- Output: compact list of recent thread ids/previews

#### `/status`

- Input: none
- Behavior: return queue size, current task/turn/thread, runtime statuses
- Output: single status message

#### `/stop`

- Input: none
- Behavior: if running turn exists, call `turn/interrupt`
- Output: cancelled/ignored status

### DM Plain Text

- Non-empty owner DM messages are treated as equivalent to `/ask prompt:<text>`.

## 2) Runtime Protocol Contract (Codex app-server)

### Requests sent by bridge

- `initialize`
- `thread/start`
- `thread/resume`
- `thread/list`
- `turn/start`
- `turn/interrupt`

### Notifications consumed by bridge

- `turn/started`
- `item/agentMessage/delta`
- `item/commandExecution/outputDelta`
- `turn/completed`
- `error`

### Compatibility policy

- Unknown notifications MUST be ignored safely and logged in debug mode.

## 3) Persistence Contract

### `data/tasks.jsonl`

Append-only task events with these minimum fields:

- `taskId`, `threadId`, `turnId?`, `status`, `createdAt`, `updatedAt`, `sourceType`, `inputText`, `error?`

### `data/runtime_state.json`

Single JSON object containing:

- `activeThreadId`, `activeTurnId?`, `activeTaskId?`, `queueLength`, `appServerStatus`, `discordStatus`, `updatedAt`, `lastError?`

## 4) Error Contract

- Errors exposed to Discord must be human-actionable and redacted.
- Common categories:
  - `CONFIG_ERROR`
  - `AUTH_ERROR`
  - `APP_SERVER_DOWN`
  - `DISCORD_API_ERROR`
  - `RUNTIME_INTERNAL_ERROR`

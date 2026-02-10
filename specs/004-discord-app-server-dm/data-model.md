# Data Model: Discord Codex App-Server DM Bridge v2

## Entity: BridgeTask

Represents one owner-triggered execution request from Discord.

### Fields

- `taskId` (string, required): deterministic task identifier (`T-<timestamp>-<seq>`).
- `sourceType` (enum, required): `slash` | `dm_text`.
- `sourceMessageId` (string, optional): Discord message id for DM plain-text.
- `sourceInteractionId` (string, optional): Discord interaction id for slash calls.
- `threadId` (string, required): active Codex thread id.
- `turnId` (string, optional): Codex turn id once started.
- `inputText` (string, required): owner input.
- `status` (enum, required): `queued` | `running` | `success` | `failed` | `cancelled`.
- `createdAt` (ISO datetime, required)
- `startedAt` (ISO datetime, optional)
- `completedAt` (ISO datetime, optional)
- `errorCode` (string, optional)
- `errorMessage` (string, optional, redacted)
- `outputSummary` (string, optional)

### Validation Rules

- `inputText` must be non-empty after trim.
- `threadId` required before `turn/start`.
- `turnId` required for interrupt path.
- Terminal states (`success|failed|cancelled`) require `completedAt`.

### State Transitions

- `queued -> running`
- `running -> success`
- `running -> failed`
- `running -> cancelled`

## Entity: BridgeRuntimeState

Represents persistent runtime snapshot for recovery and status display.

### Fields

- `activeThreadId` (string, required)
- `activeTurnId` (string, optional)
- `activeTaskId` (string, optional)
- `queueLength` (number, required)
- `appServerStatus` (enum): `starting` | `ready` | `restarting` | `down`
- `discordStatus` (enum): `connecting` | `ready` | `reconnecting` | `down`
- `lastError` (object, optional)
- `updatedAt` (ISO datetime, required)

### Validation Rules

- When `activeTurnId` exists, `activeTaskId` must exist.
- `queueLength` must be >= 0.

## Entity: OwnerSessionBinding

Represents current owner session preferences and thread history pointer.

### Fields

- `ownerUserId` (string, required)
- `dmChannelId` (string, optional)
- `currentThreadId` (string, required)
- `lastThreadIds` (array<string>, optional)
- `updatedAt` (ISO datetime, required)

### Validation Rules

- Only one owner binding is stored for this deployment.
- `currentThreadId` must refer to an existing or resumable Codex thread.

# Data Model: Discord Codex Bridge

## Entities

### BotConfiguration
- **Fields**: discordToken (secret), commandPrefix, channelAllowlist, allowedUserIds, allowedRoleIds, codexSessionId, codexCwd, codexArgs, memoryDir, memoryJsonl, memoryMarkdown, replyOnError, sendTyping, immediateAck, ackMessage, logRejections, rejectionLog, reconnectTimeoutMs, reconnectIntervalMs, allowDm, autoReplyInDm, autoReplyInChannels
- **Notes**: Loaded from config file + environment overrides; secrets are redacted before logging.

### CommandInvocation
- **Fields**: timestamp, channelId, messageId, authorId, authorTag, prompt, receivedAt, ackedAt, respondedAt, status
- **Notes**: Created for every accepted command before execution; message content is stored in redacted form only.

### CodexSessionReference
- **Fields**: sessionId, useLast (boolean), runId, durationMs, exitCode
- **Notes**: runId is generated per invocation; sessionId is configured.

### MemoryEntry
- **Fields**: timestamp, timing (receivedAt/ackedAt/respondedAt), discord (channel/message/user), codex (sessionId, prompt, response), result (exitCode/duration), error (if any)
- **Notes**: Written to JSONL and Markdown for auditability; sensitive strings are redacted.

### RejectionEntry
- **Fields**: timestamp, reason, discord (channel/message/user), commandPrefix
- **Notes**: Written to `rejections.jsonl` when command messages are rejected by allowlist checks.

### ImportantEntry
- **Fields**: timestamp, keyword, note, discord (channel/message/user)
- **Notes**: Written to `important.jsonl` and `important.md` when a message starts with an important keyword.

## Relationships

- **BotConfiguration** controls which **CommandInvocation** records are accepted.
- Each **CommandInvocation** spawns one **CodexSessionReference** and produces one **MemoryEntry**.

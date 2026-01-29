# Discord Command Contract

## Command Prefix

- **Default**: `!codex`
- **Configurable**: `commandPrefix` in config or `COMMAND_PREFIX` env

## Command: Resume Codex

**Syntax**:
```
!codex <prompt>
```

**Behavior**:
- Accepts commands only from allowlisted channels/users.
- If `allowedRoleIds` is configured, the user must have at least one allowlisted role.
- Runs the local Codex CLI with the configured session ID.
- Replies to the originating message with the response.
- Splits long responses into chunks <= 1900 characters.
- When `autoReplyInDm` or `autoReplyInChannels` is enabled, non-prefixed messages are treated as prompts.

**Errors**:
- Empty prompt → replies with usage message.
- Unauthorized channel/user → no execution; optional rejection message.
- Codex failure → always replies; `replyOnError=false` returns a generic error message.

## Configuration Contract

### config.json

```json
{
  "discordToken": "...",
  "commandPrefix": "!codex",
  "channelAllowlist": ["123", "456"],
  "allowedUserIds": ["789"],
  "allowedRoleIds": ["987"],
  "codexSessionId": "last",
  "codexCwd": "/path/to/project",
  "codexArgs": [],
  "memoryDir": "./memory",
  "memoryJsonl": "memory.jsonl",
  "memoryMarkdown": "memory.md",
  "replyOnError": true,
  "sendTyping": true,
  "immediateAck": false,
  "ackMessage": "acknowledged",
  "logRejections": true,
  "rejectionLog": "rejections.jsonl",
  "reconnectTimeoutMs": 120000,
  "reconnectIntervalMs": 30000,
  "importantKeywords": ["记住", "记一下", "记录"],
  "importantJsonl": "important.jsonl",
  "importantMarkdown": "important.md",
  "importantReply": "已记录",
  "allowDm": true,
  "autoReplyInDm": true,
  "autoReplyInChannels": true
}
```

### Environment Overrides

- `DISCORD_TOKEN`
- `COMMAND_PREFIX`
- `CHANNEL_ALLOWLIST`
- `ALLOWED_USER_IDS`
- `ALLOWED_ROLE_IDS`
- `CODEX_SESSION_ID`
- `CODEX_CWD`
- `CODEX_ARGS`
- `MEMORY_DIR`
- `MEMORY_JSONL`
- `MEMORY_MD`
- `REPLY_ON_ERROR`
- `SEND_TYPING`
- `IMMEDIATE_ACK`
- `ACK_MESSAGE`
- `LOG_REJECTIONS`
- `REJECTION_LOG`
- `RECONNECT_TIMEOUT_MS`
- `RECONNECT_INTERVAL_MS`
- `IMPORTANT_KEYWORDS`
- `IMPORTANT_JSONL`
- `IMPORTANT_MD`
- `IMPORTANT_REPLY`
- `ALLOW_DM`
- `AUTO_REPLY_DM`
- `AUTO_REPLY_CHANNELS`

### Role Allowlist Note

If `allowedRoleIds` is set, the bot must have access to member roles. Enable the **Server Members Intent** in the Discord Developer Portal and include the `GuildMembers` intent in the bot configuration.

# NexusBot

English | [中文](README.zh-CN.md)

NexusBot is a local Discord bridge that resumes a Codex CLI session and stores memory locally.

## Overview

Run a lightweight Discord bot that forwards messages to your local Codex CLI,
optionally enforces allowlists/approvals, and records memory to JSONL/Markdown.

## Prerequisites

- Node.js 20+
- Local Codex CLI available in PATH
- Discord bot token with Message Content Intent enabled

## Setup

1) Install dependencies

```
npm install
```

2) Create config

```
cp config.json.example config.json
```

Update `config.json` with your token, channel IDs, and Codex session ID.
If you use `allowedRoleIds`, enable **Server Members Intent** in the Discord Developer Portal.

3) Run

```
npm start
```

## Agents SDK (optional)

If `useAgentsSdk` is enabled, install dependencies:

```
python3 -m pip install --user --break-system-packages openai-agents openai python-dotenv
```

## Usage

Default behavior is full chat mode. Any message in allowed channels/DMs is treated as a prompt
unless it starts with an important keyword.

Command mode (optional):

```
!nexus your prompt here
```

Sessions:

```
!nexus sessions [n]
!nexus session <id|last>
```

Slash commands (bridge to Codex):

```
/approvals
/compact
/skill
/skill-creator
/new
/resume
/fork
```

`/skill` lists local skills, `/skill-creator` runs the built-in skill creator.
`/new` `/resume` `/fork` mirror Codex CLI slash commands.

Approval flow (optional):

- Non-owner messages that look risky or are commands will be held for approval.
- Set `approvalUseModel` / `APPROVAL_USE_MODEL=true` to let the model decide if approval is needed.
- Use deterministic rules + whitelist via config:
  - `approvalRules.commandKeywords`, `approvalRules.pathPatterns`, `approvalRules.denyPatterns`
  - `approvalAllowlistUserIds`, `approvalAllowlistRoleIds`, `approvalAllowlistChannelIds`,
    `approvalAllowlistGuildIds`, `approvalAllowlistPatterns`
  - Patterns accept `/regex/flags` or plain substring matches.
- Owner can approve or reject:

```
!nexus pending
!nexus approve <id>
!nexus reject <id>
```

Important notes:

```
记住 这是重要信息
```

Session helpers:

```
!nexus sessions
!nexus sessions 5
!nexus session <id|last>
!nexus task <prompt>
!nexus schedule add <channelId|here> <interval> <message>
!nexus schedule list
!nexus schedule remove <id>
```

Message server (for cron or external scripts):

```
curl -X POST http://127.0.0.1:18790/message \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"CHANNEL_ID","message":"hello from cron"}'
```

If `MESSAGE_SERVER_TOKEN` is set, add:

```
-H 'Authorization: Bearer <TOKEN>'
```

## Configuration Overrides (env)

- `DISCORD_TOKEN`
- `COMMAND_PREFIX`
- `CHANNEL_ALLOWLIST` (comma-separated)
- `ALLOWED_USER_IDS` (comma-separated)
- `ALLOWED_ROLE_IDS` (comma-separated)
- `CODEX_SESSION_ID`
- `CODEX_CWD`
- `CODEX_ARGS` (JSON array)
- `MEMORY_DIR`
- `MEMORY_JSONL`
- `MEMORY_MD`
- `REPLY_ON_ERROR` (true/false)
- `SEND_TYPING` (true/false)
- `IMMEDIATE_ACK` (true/false)
- `ACK_MESSAGE` (string)
- `LOG_REJECTIONS` (true/false)
- `REJECTION_LOG` (filename)
- `RECONNECT_TIMEOUT_MS` (number)
- `RECONNECT_INTERVAL_MS` (number)
- `APPROVAL_USE_MODEL` (true/false)
- `APPROVAL_ALLOWLIST_USER_IDS` (comma-separated)
- `APPROVAL_ALLOWLIST_ROLE_IDS` (comma-separated)
- `APPROVAL_ALLOWLIST_CHANNEL_IDS` (comma-separated)
- `APPROVAL_ALLOWLIST_GUILD_IDS` (comma-separated)
- `APPROVAL_ALLOWLIST_PATTERNS` (comma-separated)
- `APPROVAL_RULES` (JSON object)
- `MAX_CONCURRENT_RUNS` (number)
  - Controls concurrent background task runs (`!nexus task`). Normal chat remains responsive per-channel.
- `AUTO_TASK_ROUTING` (true/false)
- `TASK_ROUTING_TIMEOUT_MS` (number)
- `TASK_ROUTING_KEYWORDS` (comma-separated)
- `TASK_ROUTING_MIN_CHARS` (number)
- `SCHEDULES_FILE` (path)
- `SAFETY_DENYLIST_KEYWORDS` (comma-separated)
- `SAFETY_DENYLIST_REJECT` (true/false)
- `MESSAGE_SERVER_ENABLED` (true/false)
- `MESSAGE_SERVER_PORT` (number)
- `MESSAGE_SERVER_TOKEN` (string)
- `CODEX_SWEEP_INTERVAL_MS` (number)
- `CODEX_SWEEP_MAX_AGE_SEC` (number)
- `PER_USER_SESSIONS` (true/false)
- `USER_SESSIONS_FILE` (path)
- `IMPORTANT_KEYWORDS` (comma-separated)
- `IMPORTANT_JSONL` (filename)
- `IMPORTANT_MD` (filename)
- `IMPORTANT_REPLY` (string)
- `ALLOW_DM` (true/false)
- `AUTO_REPLY_DM` (true/false)
- `AUTO_REPLY_CHANNELS` (true/false)
- `MENTION_REPLY_CHANNELS` (true/false)
- `OWNER_USER_ID`
- `OWNER_USER_IDS` (comma-separated)
- `ADMIN_CHANNEL_ID`
- `REQUIRE_OWNER_APPROVAL` (true/false)
- `APPROVALS_LOG` (filename)
- `USE_AGENTS_SDK` (true/false)
- `AGENTS_PYTHON`
- `AGENTS_SCRIPT`
- `AGENTS_APPROVAL_POLICY`
- `AGENTS_SANDBOX`
- `AGENTS_THREADS_FILE`
- `AGENTS_OPENAI_API_KEY`
- `AGENTS_OPENAI_BASE_URL`
- `AGENTS_HTTP_PROXY`
- `AGENTS_HTTPS_PROXY`
- `AGENTS_NO_PROXY`
- `LOCK_FILE` (path)
- `REGISTER_SLASH_COMMANDS` (true/false)
- `SLASH_GUILD_IDS` (comma-separated)
- `SESSIONS_DIR`
- `SESSIONS_LIMIT` (number)
- `SESSIONS_DIR`
- `SESSIONS_LIMIT` (number)

`REPLY_ON_ERROR=false` still replies with a generic error message; it only controls whether details are included.

## Memory

Logs are appended to:
- `memory/memory.jsonl`
- `memory/memory.md`
- `memory/rejections.jsonl` (if enabled)
- `memory/important.jsonl`
- `memory/important.md`

## Metrics (optional)

```
node scripts/metrics.js --file memory/memory.jsonl
```

To include rejections:

```
node scripts/metrics.js --file memory/memory.jsonl --rejections memory/rejections.jsonl
```

## Quality Gates

```
npm test
npm run lint
```

# codex-discord-bridge

Local Discord bridge that resumes a Codex CLI session and stores memory locally.  
本地 Discord 桥接服务：可恢复 Codex CLI 会话，并将记忆写入本地。

## 简介 / Overview

Run a lightweight Discord bot that forwards messages to your local Codex CLI,
optionally enforces allowlists/approvals, and records memory to JSONL/Markdown.  
运行一个轻量 Discord 机器人，把消息转发给本地 Codex CLI，可选启用白名单与审批，并将记忆写入 JSONL/Markdown。

## Prerequisites / 环境要求

- Node.js 20+
- Local Codex CLI available in PATH
- Discord bot token with Message Content Intent enabled

## Setup / 安装与运行

1) Install dependencies

```
npm install
```

2) Create config

```
cp config.json.example config.json
```

Update `config.json` with your token, channel IDs, and Codex session ID.  
请在 `config.json` 中填写你的 token、频道 ID 与会话 ID。  
If you use `allowedRoleIds`, enable **Server Members Intent** in the Discord Developer Portal.  
如使用 `allowedRoleIds`，需在 Discord 开发者后台启用 **Server Members Intent**。

3) Run

```
npm start
```

## Agents SDK (optional) / Agents SDK（可选）

If `useAgentsSdk` is enabled, install dependencies:

```
python3 -m pip install --user --break-system-packages openai-agents openai python-dotenv
```

## Usage / 用法

Default behavior is full chat mode. Any message in allowed channels/DMs is treated as a prompt
unless it starts with an important keyword.  
默认是完整聊天模式：在允许的频道/私信中的消息都会作为 prompt（除非以“重要关键词”开头）。

Command mode (optional) / 命令模式（可选）:

```
!codex your prompt here
```

Sessions / 会话:

```
!codex sessions [n]
!codex session <id|last>
```

Slash commands (bridge to Codex) / 斜杠命令（桥接 Codex）:

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
`/skill` 列出本地技能，`/skill-creator` 运行内置技能创建器。  
`/new` `/resume` `/fork` mirror Codex CLI slash commands.  
`/new` `/resume` `/fork` 对齐 Codex CLI 的斜杠命令。

Approval flow (optional) / 审批流程（可选）:

- Non-owner messages that look risky or are commands will be held for approval.  
  非 Owner 的高风险或命令类消息将进入审批队列。  
- Set `approvalUseModel` / `APPROVAL_USE_MODEL=true` to let the model decide if approval is needed.  
  可设置 `approvalUseModel` / `APPROVAL_USE_MODEL=true` 交给模型判断是否需要审批。
- Use deterministic rules + whitelist via config:
  - `approvalRules.commandKeywords`, `approvalRules.pathPatterns`, `approvalRules.denyPatterns`
  - `approvalAllowlistUserIds`, `approvalAllowlistRoleIds`, `approvalAllowlistChannelIds`,
    `approvalAllowlistGuildIds`, `approvalAllowlistPatterns`
  - Patterns accept `/regex/flags` or plain substring matches.
- Owner can approve or reject:

```
!codex pending
!codex approve <id>
!codex reject <id>
```

Important notes / 重要信息提示:

```
记住 这是重要信息
```

Session helpers / 会话辅助命令:

```
!codex sessions
!codex sessions 5
!codex session <id|last>
!codex task <prompt>
!codex schedule add <channelId|here> <interval> <message>
!codex schedule list
!codex schedule remove <id>
```

Message server (for cron or external scripts) / 消息服务器（用于 cron 或外部脚本）:

```
curl -X POST http://127.0.0.1:18790/message \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"CHANNEL_ID","message":"hello from cron"}'
```

If `MESSAGE_SERVER_TOKEN` is set, add:  
若设置了 `MESSAGE_SERVER_TOKEN`，请增加：

```
-H 'Authorization: Bearer <TOKEN>'
```

## Configuration Overrides (env) / 环境变量覆盖

Below is the full override list (variable names are not translated).  
以下为完整环境变量列表（变量名保持英文不翻译）。

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
  - Controls concurrent background task runs (`!codex task`). Normal chat remains responsive per-channel.
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

## Memory / 记忆日志

Logs are appended to:  
日志将追加到：
- `memory/memory.jsonl`
- `memory/memory.md`
- `memory/rejections.jsonl` (if enabled)
- `memory/important.jsonl`
- `memory/important.md`

## Metrics (optional) / 指标统计（可选）

```
node scripts/metrics.js --file memory/memory.jsonl
```

To include rejections:

```
node scripts/metrics.js --file memory/memory.jsonl --rejections memory/rejections.jsonl
```

## Quality Gates / 质量门禁

```
npm test
npm run lint
```

# NexusBot

中文 | [English](README.md)

NexusBot 是本地 Discord 桥接服务：可恢复 Codex CLI 会话，并将记忆写入本地。

## 简介

运行一个轻量 Discord 机器人，把消息转发给本地 Codex CLI，可选启用白名单与审批，并将记忆写入 JSONL/Markdown。

## 为什么是 NexusBot

- 通过 Codex CLI 的缓存减少 Moltbot 的 token 消耗（具体节省与提供方/配置有关）。
- 解决长时间运行掉线问题：本地 Node 服务 + 重连机制，并配合进程守护常驻。
- 只接入 Discord，因为目前仅使用 Discord 作为主要沟通渠道。

## 如何保证 NexusBot 常驻

NexusBot 本质是一个 Node.js 进程。要长期稳定运行并在异常退出后自动拉起，
建议使用 systemd 或 PM2 进行守护。

### 方案 A：systemd（Linux 推荐）

在 `~/.config/systemd/user/nexusbot.service` 新建服务文件：

```
[Unit]
Description=NexusBot
After=network-online.target

[Service]
WorkingDirectory=/path/to/nexusbot
ExecStart=/usr/bin/node /path/to/nexusbot/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# EnvironmentFile=/path/to/nexusbot/.env

[Install]
WantedBy=default.target
```

启用并查看日志：

```
systemctl --user daemon-reload
systemctl --user enable --now nexusbot
journalctl --user -u nexusbot -f
```

### 方案 B：PM2

```
npm install -g pm2
pm2 start src/index.js --name nexusbot
pm2 save
pm2 startup
```

提示：可在 `config.json` 中调整 `reconnectTimeoutMs` 和 `reconnectIntervalMs`
来控制 Discord 的重连行为。

## 环境要求

- Node.js 20+
- 本地 Codex CLI 已加入 PATH
- Discord 机器人 token，且启用 Message Content Intent

## 安装与运行

1) 安装依赖

```
npm install
```

2) 创建配置

```
cp config.json.example config.json
```

请在 `config.json` 中填写你的 token、频道 ID 与会话 ID。
如使用 `allowedRoleIds`，需在 Discord 开发者后台启用 **Server Members Intent**。

3) 运行

```
npm start
```

## Agents SDK（可选）

如果启用了 `useAgentsSdk`，请安装依赖：

```
python3 -m pip install --user --break-system-packages openai-agents openai python-dotenv
```

## 用法

默认是完整聊天模式：在允许的频道/私信中的消息都会作为 prompt（除非以“重要关键词”开头）。

命令模式（可选）:

```
!nexus your prompt here
```

会话:

```
!nexus sessions [n]
!nexus session <id|last>
```

斜杠命令（桥接 Codex）:

```
/approvals
/compact
/skill
/skill-creator
/new
/resume
/fork
```

`/skill` 列出本地技能，`/skill-creator` 运行内置技能创建器。
`/new` `/resume` `/fork` 对齐 Codex CLI 的斜杠命令。

审批流程（可选）:

- 非 Owner 的高风险或命令类消息将进入审批队列。
- 可设置 `approvalUseModel` / `APPROVAL_USE_MODEL=true` 交给模型判断是否需要审批。
- 使用配置中的规则与白名单：
  - `approvalRules.commandKeywords`, `approvalRules.pathPatterns`, `approvalRules.denyPatterns`
  - `approvalAllowlistUserIds`, `approvalAllowlistRoleIds`, `approvalAllowlistChannelIds`,
    `approvalAllowlistGuildIds`, `approvalAllowlistPatterns`
  - 支持 `/regex/flags` 或普通子串匹配。
- Owner 可批准或拒绝：

```
!nexus pending
!nexus approve <id>
!nexus reject <id>
```

重要信息提示:

```
记住 这是重要信息
```

会话辅助命令:

```
!nexus sessions
!nexus sessions 5
!nexus session <id|last>
!nexus task <prompt>
!nexus schedule add <channelId|here> <interval> <message>
!nexus schedule list
!nexus schedule remove <id>
```

消息服务器（用于 cron 或外部脚本）:

```
curl -X POST http://127.0.0.1:18790/message \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"CHANNEL_ID","message":"hello from cron"}'
```

若设置了 `MESSAGE_SERVER_TOKEN`，请增加：

```
-H 'Authorization: Bearer <TOKEN>'
```

## 环境变量覆盖

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

`REPLY_ON_ERROR=false` 仍会回复一条通用错误消息，只是不会附带详细错误信息。

## 记忆日志

日志将追加到：
- `memory/memory.jsonl`
- `memory/memory.md`
- `memory/rejections.jsonl`（如启用）
- `memory/important.jsonl`
- `memory/important.md`

## 指标统计（可选）

```
node scripts/metrics.js --file memory/memory.jsonl
```

包含 rejection：

```
node scripts/metrics.js --file memory/memory.jsonl --rejections memory/rejections.jsonl
```

## 质量门禁

```
npm test
npm run lint
```

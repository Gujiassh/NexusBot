# Quickstart: Discord Codex Bridge

## Prerequisites

- Node.js 20+
- Local Codex CLI available in PATH
- A Discord bot token with Message Content Intent enabled

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a config file:
   ```bash
   cp config.json.example config.json
   ```

3. Update `config.json` with:
   - `discordToken`
   - `channelAllowlist` (channel IDs)
   - `allowedUserIds` (optional user allowlist)
   - `allowedRoleIds` (optional role allowlist; requires Server Members Intent)
   - `codexSessionId` (or "last")

4. Start the service:
   ```bash
   npm run start
   ```

## Usage

Default behavior is full chat mode. Any message in allowed channels/DMs is treated as a prompt
unless it starts with an important keyword.

Command mode (optional):

```
!nexus <your prompt here>
```

Important notes:

```
记住 这是重要信息
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
- `IMPORTANT_KEYWORDS` (comma-separated)
- `IMPORTANT_JSONL` (filename)
- `IMPORTANT_MD` (filename)
- `IMPORTANT_REPLY` (string)
- `ALLOW_DM` (true/false)
- `AUTO_REPLY_DM` (true/false)
- `AUTO_REPLY_CHANNELS` (true/false)

`REPLY_ON_ERROR=false` still replies with a generic error message; it only controls whether details are included.

## Logs & Memory

- JSONL: `memory/memory.jsonl`
- Markdown: `memory/memory.md`
- Rejections: `memory/rejections.jsonl` (if enabled)
- Important: `memory/important.jsonl`, `memory/important.md`

## Metrics (optional)

```bash
node scripts/metrics.js --file memory/memory.jsonl
```

Include rejections:

```bash
node scripts/metrics.js --file memory/memory.jsonl --rejections memory/rejections.jsonl
```

## Quality Gates

```bash
npm test
npm run lint
```

## Troubleshooting

- If the bot does not respond, verify channel IDs and token permissions.
- If Codex errors, ensure the session ID is valid and the CLI is on PATH.

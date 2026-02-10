# Quickstart: Discord Codex App-Server DM Bridge v2

## Prerequisites

- Node.js 20+
- `codex` CLI installed and authenticated
- Discord bot token with DM + slash command support

## 1. Install

```bash
npm install
```

## 2. Configure

1) Copy config template:

```bash
cp config.json.example config.json
```

2) Set required fields:

- `discordToken`
- `ownerUserId`
- `codexCwd`

3) Optional hardening:

- keep `allowDm=true`
- keep channel auto-reply disabled (DM-only model)

## 3. Start service

```bash
npm start
```

## 4. Smoke test (owner DM)

1) Open DM with bot account.
2) Run `/new` and confirm thread id is returned.
3) Run `/ask prompt:"请回复 hello"` and confirm:
   - ACK within ~2s
   - stream updates appear
   - final completed result
4) Run `/status` and check queue/thread fields.
5) While a long task is running, run `/stop` and confirm cancellation.

## 5. Persistence checks

After at least one task:

- `data/tasks.jsonl` should contain task lifecycle records.
- `data/runtime_state.json` should contain active thread and latest runtime status.
- `logs/bridge.log` should contain structured redacted logs.

## 6. Common issues

- `codex` not found: ensure PATH includes Codex CLI.
- auth error from app-server: run local Codex login flow first.
- slash commands missing: verify registration and guild/global propagation delay.

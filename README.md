# codex-discord-bridge-public (v2)

Discord ↔ Codex bridge focused on a single operator workflow:

- **Owner-only** access
- **DM-only** execution
- **Slash-first** controls
- Native **`codex app-server`** JSON-RPC integration (no CLI text scraping)

## Why v2

This rewrite optimizes for reliability and operational simplicity:

- Removes optional HTTP inbound server by default
- Uses explicit thread/turn APIs (`thread/*`, `turn/*`)
- Keeps durable local task/runtime logs for troubleshooting

## Commands (DM with bot)

- `/ask prompt:<text>` → enqueue and execute a task
- `/new` → create and switch to a new thread
- `/thread id:<threadId>` → switch to an existing thread
- `/threads [limit]` → list recent threads
- `/status` → show queue/runtime state
- `/stop` → interrupt current running turn

Plain DM text from owner is also treated as task input (configurable).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Prepare config:

```bash
cp config.json.example config.json
```

3. (Optional) Migrate token/owner values from previous private bridge:

```bash
node scripts/migrate-config.js
```

By default the migration script reads:
`/home/cc/codex-discord-bridge/config.json`

4. Start bridge:

```bash
npm start
```

## Required config

At minimum set in `config.json`:

- `discordToken`
- `ownerUserId`
- `codexCwd`

## Runtime files

- `data/tasks.jsonl` → append-only lifecycle events
- `data/runtime_state.json` → latest runtime snapshot
- `logs/bridge.log` → structured operational logs

## Quality checks

```bash
npm run lint
npm test
```

## Notes

- `config.json` is gitignored; keep secrets local.
- Unknown app-server notifications are ignored safely and logged.
- This repo keeps legacy files from v1 for compatibility, but v2 entrypoint is `src/index.js`.

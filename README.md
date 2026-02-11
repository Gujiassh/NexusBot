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
- Supports **non-blocking dispatch + concurrent workers** to avoid one stuck task blocking all conversations

## Commands (DM with bot)

- `/ask prompt:<text>` → enqueue and execute a task
- `/new` → create and switch control thread
- `/thread id:<threadId>` → switch control thread
- `/threads [limit]` → list recent threads
- `/history [limit]` → list recent task history from local logs
- `/recall [limit]` → import recent task memory into current control thread
- `/status` → show queue/runtime state
- `/stop [task_id]` → interrupt current task, or specific running task

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

## Performance + continuity config

- `maxConcurrentTasks` (default `2`): max tasks running in parallel
- `taskThreadMode` (default `isolated`):
  - `isolated`: each task runs in its own thread (recommended, avoids cross-task blocking)
  - `shared`: tasks reuse control thread
- `historyDefaultLimit` (default `10`): default `/history` count
- `recallDefaultLimit` (default `8`): default `/recall` import count

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
- Unknown/noisy app-server notifications are ignored safely.
- This repo keeps legacy files from v1 for compatibility, but v2 entrypoint is `src/index.js`.

# Implementation Plan: Discord Codex Bridge

**Branch**: `003-discord-nexusbot` | **Date**: 2026-01-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-discord-nexusbot/spec.md`

## Summary

Build a local Node.js Discord listener that accepts commands from allowlisted channels/users, resumes a Codex session with a prompt via the local CLI, returns responses to Discord, and records each invocation to local JSONL + Markdown memory logs.

## Technical Context

**Language/Version**: JavaScript (ESM) on Node.js 20+  
**Primary Dependencies**: discord.js v14, dotenv  
**Storage**: Local filesystem (`memory/` JSONL + Markdown logs)  
**Testing**: Node.js built-in `node:test` for config/parser utilities (add minimal unit tests)  
**Target Platform**: Local workstation running Codex CLI  
**Project Type**: Single Node service (no workspace)  
**Performance Goals**: Ack a valid command within 5 seconds; respond within 30 seconds for typical prompts; chunk messages to stay within Discord limits  
**Constraints**: No secrets in logs or replies; allowlist enforcement; sequential execution to avoid concurrent Codex sessions  
**Scale/Scope**: 1–5 channels, low throughput, single-operator control

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Intent → Flow/Logix → Code → Runtime**: Intent = remote control of local Codex. Flow = Discord message → validation/allowlist → queue → Codex CLI → response → memory write. Code = `src/` services and command handlers. Runtime = single Node process with Discord gateway connection.
- **Docs/spec dependencies**: Only this feature spec and its outputs; no external docs/specs required.
- **Effect/Logix contracts**: N/A (no Logix runtime or Effect contracts).
- **IR & anchors**: N/A.
- **Deterministic identity**: Use Discord message IDs + generated run IDs; persisted in memory logs.
- **Transaction boundary**: N/A; sequential queue avoids concurrent session conflicts.
- **Internal contracts & trial runs**: Keep Codex runner and Discord client as explicit services; no process-global hidden state.
- **Dual kernels (core/core-ng)**: N/A.
- **Performance budget**: Basic timing of Codex execution; no runtime hot paths.
- **Diagnosability**: Console logs + memory records; avoid secrets.
- **User-facing performance mental model**: N/A.
- **Breaking changes**: Any command syntax or config changes documented in quickstart + contracts.
- **Public submodules**: N/A.
- **Quality gates**: `npm test` (once added) + `npm run lint` (if lint added), plus manual command smoke test.

Result: **PASS** (no constitutional violations; constraints are documented).

## Perf Evidence Plan（MUST）

N/A — this feature does not touch Logix runtime paths or performance-critical rendering hot paths.

## Project Structure

### Documentation (this feature)

```text
specs/003-discord-nexusbot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── discord-commands.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.js
├── commands/
│   └── codexCommand.js
├── services/
│   ├── config.js
│   ├── discordClient.js
│   ├── codexRunner.js
│   └── memoryStore.js
└── utils/
    └── messageChunker.js

memory/
config.json.example
```

**Structure Decision**: Single Node service with small modules for config, Discord integration, Codex execution, and memory persistence. Command parsing is isolated for testability.

## Complexity Tracking

No constitution violations; no additional complexity tracking required.

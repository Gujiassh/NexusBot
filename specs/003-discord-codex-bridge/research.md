# Research: Discord Codex Bridge

**Date**: 2026-01-28

## Decisions

### 1) Discord Integration Library
- **Decision**: Use discord.js v14 with message content intent and gateway reconnect handling.
- **Rationale**: Mature library, already present in repo, supports required intents.
- **Alternatives considered**: Raw REST/WebSocket or other wrappers; rejected for higher complexity.

### 2) Codex Invocation Strategy
- **Decision**: Execute `codex exec --json --output-last-message ... resume <session>` via child process; read output from file with stdout fallback.
- **Rationale**: Stable output capture and predictable response parsing.
- **Alternatives considered**: Parse stdout only; rejected due to variability and truncation risk.

### 3) Command Handling & Concurrency
- **Decision**: Prefix-based commands and sequential queue (single active run).
- **Rationale**: Prevents concurrent session conflicts and simplifies error handling.
- **Alternatives considered**: Parallel runs; rejected due to session collision risk.

### 4) Local Memory Storage
- **Decision**: Write JSONL + Markdown to local filesystem.
- **Rationale**: JSONL enables machine parsing; Markdown provides human-readable audit trail.
- **Alternatives considered**: Database or single format; rejected as unnecessary for low volume.

### 5) Message Output Chunking
- **Decision**: Split responses into <=1900 character chunks.
- **Rationale**: Avoids Discord message length limits while preserving readability.
- **Alternatives considered**: File attachments; rejected for higher friction.

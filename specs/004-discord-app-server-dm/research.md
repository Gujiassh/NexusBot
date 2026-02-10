# Research: Discord Codex App-Server DM Bridge v2

**Date**: 2026-02-10

## Decision 1: Runtime integration方式

- **Decision**: Use a long-lived `codex app-server` subprocess over stdio JSON-RPC.
- **Rationale**: Supports streaming events (`item/agentMessage/delta`) and explicit thread/turn control (`thread/*`, `turn/*`) without brittle CLI text parsing.
- **Alternatives considered**:
  - `codex exec` process-per-request: simpler startup but weaker streaming/state continuity.
  - Legacy bridge parser reuse: carries old complexity and drift.

## Decision 2: Access model

- **Decision**: Hard gate to owner-only and DM-only.
- **Rationale**: Minimizes attack surface and matches single-operator usage.
- **Alternatives considered**:
  - Allowlist channels/roles: flexible but unnecessary complexity for this release.
  - Open DM + approval workflow: more moving parts and latency.

## Decision 3: Command UX

- **Decision**: Slash commands first (`/ask`, `/new`, `/thread`, `/threads`, `/status`, `/stop`) and DM plain-text fallback.
- **Rationale**: Slash gives discoverability and argument validation; plain-text keeps chat natural.
- **Alternatives considered**:
  - Prefix commands only: lower discoverability and deprecated feel.
  - Slash-only strict mode: reduces convenience for iterative chat.

## Decision 4: Concurrency strategy

- **Decision**: Single queue with one active turn at a time.
- **Rationale**: Avoids turn/thread race conditions and simplifies state recovery.
- **Alternatives considered**:
  - Multi-turn parallelism: higher throughput but significantly more complexity and higher failure risk.

## Decision 5: Persistence model

- **Decision**: Persist events in `data/tasks.jsonl` and runtime snapshot in `data/runtime_state.json`.
- **Rationale**: JSONL is append-friendly and audit-friendly; snapshot accelerates restart recovery.
- **Alternatives considered**:
  - In-memory only: poor diagnosability after crash.
  - SQLite: overkill for single-owner low-traffic scope.

## Decision 6: message server policy

- **Decision**: Do not expose HTTP message server in v2.
- **Rationale**: Prevents extra port conflicts and shrinks security surface.
- **Alternatives considered**:
  - Keep optional HTTP endpoint: useful for integrations, but not required by current owner-DM workflow.

## Decision 7: Error handling and compatibility

- **Decision**: Unknown app-server notifications are logged at debug level and ignored.
- **Rationale**: Protects against protocol evolution (`codex/event/*`) without runtime crash.
- **Alternatives considered**:
  - Strict whitelist + hard fail: safer for schema drift detection but too brittle operationally.

## Decision 8: Token source and config migration

- **Decision**: Reuse existing Discord token from old bridge local config during migration; keep secrets in local `config.json`/env and never commit.
- **Rationale**: Speeds cutover and avoids manual token rotation during rewrite.
- **Alternatives considered**:
  - Force new token: cleaner separation but increases setup friction.

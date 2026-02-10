# Tasks: Discord Codex App-Server DM Bridge v2

**Input**: Design documents from `/specs/004-discord-app-server-dm/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Include focused unit tests for protocol parsing, command routing, and security gate behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish v2 config/runtime layout and migration baseline

- [x] T001 Define and implement v2 configuration schema + defaults in `src/services/config.js` and `config.json.example`
- [x] T002 Create runtime persistence/logging helpers for `data/tasks.jsonl`, `data/runtime_state.json`, `logs/bridge.log` in `src/services/runtimeStore.js`
- [x] T003 [P] Add shared task utility helpers (id/timing/state helpers) in `src/services/taskQueue.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core app-server + Discord foundation before user stories

**⚠️ CRITICAL**: No user story work starts before this phase completes

- [x] T004 Implement Codex app-server JSON-RPC client (spawn/request/notify/restart) in `src/services/codexAppServerClient.js`
- [x] T005 Implement owner-only + DM-only gate helpers and Discord client bootstrap in `src/services/discordClient.js`
- [x] T006 Implement slash command definitions/registration (`/ask`, `/new`, `/thread`, `/threads`, `/status`, `/stop`) in `src/commands/slashCommands.js` and `src/services/slashCommands.js`
- [x] T007 Rewrite orchestration entrypoint with queue + state machine shell in `src/index.js`
- [x] T008 [P] Integrate startup diagnostics + instance lock policy in `src/index.js` and `src/services/instanceLock.js`

**Checkpoint**: Foundation ready; user stories can be implemented/tested

---

## Phase 3: User Story 1 - DM任务触发与流式回传 (Priority: P1) 🎯 MVP

**Goal**: Owner can submit `/ask` or plain DM text and receive streamed results

**Independent Test**: Owner DM `/ask prompt:"reply hi"` gets ACK + streaming output + completion

### Tests for User Story 1

- [x] T009 [P] [US1] Add protocol notification parsing tests in `tests/codexAppServerClient.test.js`
- [x] T010 [P] [US1] Add `/ask` and DM-text routing tests in `tests/slashCommands.test.js`

### Implementation for User Story 1

- [x] T011 [US1] Implement `/ask` + DM text enqueue and ACK behavior in `src/index.js`
- [x] T012 [US1] Implement delta stream batching + Discord chunked send/edit in `src/index.js` and `src/utils/messageChunker.js`
- [x] T013 [US1] Persist lifecycle events (`queued/running/success/failed/cancelled`) via `src/services/runtimeStore.js` from `src/index.js`

**Checkpoint**: US1 fully functional and independently testable

---

## Phase 4: User Story 2 - Thread与中断控制 (Priority: P2)

**Goal**: Owner can manage threads and interrupt running turns

**Independent Test**: `/new`, `/thread`, `/threads`, `/status`, `/stop` behave correctly during real runs

### Tests for User Story 2

- [x] T014 [P] [US2] Add command contract tests for thread/status/stop paths in `tests/slashCommands.test.js`

### Implementation for User Story 2

- [x] T015 [US2] Implement `/new`, `/thread`, `/threads` handlers backed by `thread/*` RPC in `src/index.js`
- [x] T016 [US2] Implement `/status` handler using runtime snapshot in `src/index.js` and `src/services/runtimeStore.js`
- [x] T017 [US2] Implement `/stop` to call `turn/interrupt` on active turn in `src/index.js`

**Checkpoint**: US2 independently testable with US1 retained

---

## Phase 5: User Story 3 - 安全与稳定性 (Priority: P3)

**Goal**: Only owner DM can execute; process remains recoverable and diagnosable

**Independent Test**: Non-owner/non-DM denied; app-server crash recovers or reports actionable error

### Tests for User Story 3

- [x] T018 [P] [US3] Add gate/security behavior tests in `tests/securityGate.test.js`
- [x] T019 [P] [US3] Add redaction regression tests in `tests/redact.test.js`

### Implementation for User Story 3

- [x] T020 [US3] Enforce strict owner/DM checks for both message and interaction paths in `src/index.js` and `src/services/discordClient.js`
- [x] T021 [US3] Add app-server crash recovery + retry semantics in `src/services/codexAppServerClient.js` and `src/index.js`
- [x] T022 [US3] Apply secret redaction for logs and user-facing error output in `src/utils/redact.js` and `src/index.js`

**Checkpoint**: US3 independently testable with full security constraints

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: Finalize docs, migration, and validation

- [x] T023 [P] Update v2 usage, commands, and migration notes in `README.md`, `README.zh-CN.md`, `specs/004-discord-app-server-dm/quickstart.md`
- [x] T024 Migrate Discord token and owner id from old private bridge config into local `config.json` (untracked) via `scripts/migrate-config.js`
- [x] T025 Run full quality gates (`npm run lint`, `npm test`) and fix regressions across touched files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: start immediately
- **Phase 2**: depends on Phase 1
- **Phase 3-5**: depend on Phase 2
- **Phase 6**: depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: no dependency on other user stories
- **US2 (P2)**: depends on foundational app-server and queue shell; independent from US3
- **US3 (P3)**: depends on foundational layers only; independent from US2 feature logic

### Parallel Opportunities

- Phase 1: T003 parallelizable
- US1 tests T009/T010 can run in parallel
- US3 tests T018/T019 can run in parallel
- Phase 6 docs/migration can overlap after code stabilization

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 + 2
2. Complete US1 and verify streaming task flow in DM
3. Treat this as functional MVP

### Incremental Delivery

1. Add US2 for thread and interruption controls
2. Add US3 for strict security + recovery hardening
3. Finish docs/config migration and run final gates

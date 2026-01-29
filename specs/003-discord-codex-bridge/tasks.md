# Tasks: Discord Codex Bridge

**Input**: Design documents from `/specs/003-discord-codex-bridge/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not requested in the spec; no test tasks included.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create module folders `src/commands/`, `src/services/`, `src/utils/` and update `src/index.js` imports to use them
- [x] T002 [P] Align `config.json.example` fields with the feature spec and contracts in `config.json.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T003 Implement configuration loader + validation with env overrides in `src/services/config.js`
- [x] T004 [P] Implement Discord client setup and lifecycle logging in `src/services/discordClient.js`
- [x] T005 [P] Implement Codex runner (spawn + output capture) in `src/services/codexRunner.js`
- [x] T006 [P] Implement message chunking utility in `src/utils/messageChunker.js`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Trigger Codex from Discord (Priority: P1) 🎯 MVP

**Goal**: Execute a local Codex session from a Discord command and return the response

**Independent Test**: Send a valid command in an allowlisted channel and receive a response in that channel

### Implementation for User Story 1

- [x] T007 [US1] Implement command parsing (prefix + prompt) in `src/commands/codexCommand.js`
- [x] T008 [US1] Wire message handler + sequential queue in `src/index.js`
- [x] T009 [US1] Reply with chunked responses and handle empty prompts/errors in `src/index.js`

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Control Access and Configuration (Priority: P2)

**Goal**: Restrict access via allowlists and configure behavior without code changes

**Independent Test**: Commands from disallowed channels/users are rejected; allowlisted channels work after config update + restart

### Implementation for User Story 2

- [x] T010 [US2] Implement allowlist checks (channels/users) in `src/services/discordClient.js`
- [x] T011 [US2] Enforce allowlist before queueing jobs in `src/index.js`
- [x] T012 [US2] Document configuration + allowlist usage in `specs/003-discord-codex-bridge/contracts/discord-commands.md` and `specs/003-discord-codex-bridge/quickstart.md`

**Checkpoint**: User Story 2 is independently testable

---

## Phase 5: User Story 3 - Persist Session Memory (Priority: P3)

**Goal**: Persist command history and outcomes locally in JSONL + Markdown

**Independent Test**: After a command, a new JSONL line and Markdown section are appended in `memory/`

### Implementation for User Story 3

- [x] T013 [US3] Implement memory writer (JSONL + Markdown) in `src/services/memoryStore.js`
- [x] T014 [US3] Integrate memory recording after Codex execution in `src/index.js`
- [x] T015 [US3] Ensure memory paths are created and failures are reported safely in `src/services/memoryStore.js`

**Checkpoint**: User Story 3 is independently testable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T016 [P] Update `README.md` to match `specs/003-discord-codex-bridge/quickstart.md`
- [x] T017 [P] Add `.gitignore` entries for `config.json` and `memory/` in `.gitignore`

---

## Phase 7: Acceptance Gaps & Verification

**Purpose**: Close remaining acceptance gaps and make success criteria measurable

- [x] T018 Add role allowlist config support in `src/services/config.js` and document it in `config.json.example`, `specs/003-discord-codex-bridge/contracts/discord-commands.md`, `specs/003-discord-codex-bridge/quickstart.md`, `README.md`
- [x] T019 Implement role allowlist checks and required intent notes in `src/services/discordClient.js`
- [x] T020 Add optional immediate ACK reply configuration in `src/index.js` and `src/services/config.js` (document in `config.json.example`)
- [x] T021 Add timing fields for received/acked/responded in `src/index.js` (for SC-001/SC-005 measurement)
- [x] T022 Add secret redaction before logging or replying errors in `src/utils/redact.js`, `src/services/memoryStore.js`, `src/index.js`, `config.json.example`
- [x] T023 Add memory write retry/fallback logging in `src/services/memoryStore.js`
- [x] T024 Add a metrics helper script in `scripts/metrics.js` and document usage in `README.md` / `specs/003-discord-codex-bridge/quickstart.md`
- [x] T025 Add rejection logging in `src/index.js`, `src/services/memoryStore.js`, and update `scripts/metrics.js`
- [x] T026 Add Discord reconnect watchdog in `src/index.js` and configurable timeouts in `src/services/config.js`
- [x] T027 Document rejection/reconnect configuration in `config.json.example`, `README.md`, `specs/003-discord-codex-bridge/quickstart.md`, `specs/003-discord-codex-bridge/contracts/discord-commands.md`
- [x] T028 Add minimal lint script in `scripts/lint.js` and wire `npm run lint` in `package.json`
- [x] T029 Add minimal unit tests in `tests/redact.test.js` and wire `npm test` in `package.json`
- [x] T030 Add important keyword memory capture in `src/index.js`, `src/services/memoryStore.js`, `src/services/config.js` and document it in `config.json.example`, `README.md`, `specs/003-discord-codex-bridge/quickstart.md`, `specs/003-discord-codex-bridge/contracts/discord-commands.md`
- [x] T031 Add auto-reply mode for non-prefixed messages in `src/index.js`, `src/services/config.js`, `src/services/discordClient.js` and document it in `config.json.example`, `README.md`, `specs/003-discord-codex-bridge/quickstart.md`, `specs/003-discord-codex-bridge/contracts/discord-commands.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational completion; can proceed in priority order
- **Polish (Phase 6)**: After user stories

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational
- **User Story 2 (P2)**: Can start after Foundational
- **User Story 3 (P3)**: Can start after Foundational

### Parallel Opportunities

- T004, T005, T006 can run in parallel after T003 scaffolding is done
- T016 and T017 can run in parallel after implementation stabilizes

---

## Parallel Example: User Story 1

```text
Task: "Implement command parsing (prefix + prompt) in src/commands/codexCommand.js"
Task: "Reply with chunked responses and handle empty prompts/errors in src/index.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate User Story 1 independently

### Incremental Delivery

1. Setup + Foundational
2. Add User Story 1 → validate
3. Add User Story 2 → validate
4. Add User Story 3 → validate
5. Polish & cross-cutting updates

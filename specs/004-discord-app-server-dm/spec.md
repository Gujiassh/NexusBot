# Feature Specification: Discord Codex App-Server DM Bridge v2

**Feature Branch**: `004-discord-app-server-dm`  
**Created**: 2026-02-10  
**Status**: Draft  
**Input**: User description: "重写 bridge；仅 owner 私信可用；必须 slash commands；直接对接 codex app-server；自动完成 tasks + implement。"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - DM 里发起任务并收到流式结果 (Priority: P1)

作为 owner，我在和 Bot 的私信里发送任务（自然语言或 `/ask`），Bot 应在本机调用 Codex app-server 执行并持续回传进度与结果。

**Why this priority**: 这是核心价值链路（Discord -> 本机 Codex -> 回传），可单独形成可用 MVP。

**Independent Test**: 在 owner 私信窗口发送 `/ask prompt:"请回复 hi"`，2 秒内收到 ACK，随后收到流式输出，最终收到完成状态。

**Acceptance Scenarios**:

1. **Given** owner 在 Bot DM 中执行 `/ask`，**When** 参数合法，**Then** Bot 立即 ACK 并在任务完成后返回最终结果。
2. **Given** owner 在 DM 发送普通文本，**When** 文本非空，**Then** Bot 将其作为任务输入并返回结果。
3. **Given** 输出超过 Discord 限制，**When** Bot 发送回复，**Then** Bot 自动分片发送且内容完整可读。

---

### User Story 2 - 会话与任务可控 (Priority: P2)

作为 owner，我可以新建/切换 thread、查看当前状态、并随时中断正在执行的 turn。

**Why this priority**: 没有可控会话与中断能力，实用性和稳定性会显著下降。

**Independent Test**: 使用 `/new` 创建 thread，随后 `/status` 可见 threadId；发起任务后执行 `/stop`，任务状态变为 cancelled。

**Acceptance Scenarios**:

1. **Given** owner 执行 `/new`，**When** 命令成功，**Then** Bot 切换到新的 thread 并返回新 threadId。
2. **Given** owner 提供有效 threadId 执行 `/thread`，**When** thread 存在，**Then** Bot 成功切换并在后续任务中使用该 thread。
3. **Given** 当前有 running turn，**When** owner 执行 `/stop`，**Then** Bot 调用 `turn/interrupt` 并回报 cancelled。

---

### User Story 3 - 仅 owner 私信访问且运行稳定 (Priority: P3)

作为 owner，我需要 Bot 仅对我开放（非 owner 或非 DM 拒绝），并在异常场景下具备可恢复与可排障能力。

**Why this priority**: 这是生产可用的安全与运维底线。

**Independent Test**: 非 owner 请求无权执行；断开 app-server 后 Bot 可自动重连或给出明确错误；日志可定位问题。

**Acceptance Scenarios**:

1. **Given** 非 owner 用户触发命令，**When** Bot 收到请求，**Then** 请求被拒绝且不会执行任何本机任务。
2. **Given** owner 在非 DM 场景触发命令，**When** Bot 收到请求，**Then** 请求被拒绝。
3. **Given** app-server 意外退出，**When** owner 再次发起任务，**Then** Bot 自动恢复连接或返回可操作错误提示。

---

## Edge Cases

- owner 同时快速发送多条 `/ask`，队列应串行执行，避免 turn 互串。
- `/stop` 发生在 turn 刚完成的竞态窗口，系统需返回幂等结果（已完成/无需中断）。
- `codex app-server` 返回未知通知（如 `codex/event/*`）时，不得导致 bridge 崩溃。
- Discord 网关短时断开后恢复连接，bridge 应继续可用。
- 本地无 `codex` 命令或认证失效时，启动或执行阶段需有明确诊断信息。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST only accept interactions/messages where `user.id == OWNER_USER_ID`.
- **FR-002**: System MUST only accept commands/tasks in Discord DM context (`guildId == null`).
- **FR-003**: System MUST provide slash commands: `/ask`, `/new`, `/thread`, `/threads`, `/status`, `/stop`.
- **FR-004**: System MUST treat owner DM plain-text messages as task input when content is non-empty.
- **FR-005**: System MUST start and maintain a persistent local `codex app-server` subprocess.
- **FR-006**: System MUST initialize app-server via JSON-RPC `initialize` before task processing.
- **FR-007**: System MUST support thread lifecycle via `thread/start`, `thread/resume`, `thread/list`.
- **FR-008**: System MUST submit user turns via `turn/start` and stream incremental output to Discord.
- **FR-009**: System MUST support interruption via `turn/interrupt` mapped from `/stop`.
- **FR-010**: System MUST enforce single active running turn (serial queue) for owner session.
- **FR-011**: System MUST emit task states `queued|running|success|failed|cancelled` and persist them.
- **FR-012**: System MUST chunk outbound Discord messages to stay within platform limits.
- **FR-013**: System MUST persist runtime artifacts to local files (`tasks.jsonl`, `runtime_state.json`, logs).
- **FR-014**: System MUST implement startup diagnostics for missing env/config (`DISCORD_TOKEN`, `OWNER_USER_ID`, `codex` binary, writable data dir).
- **FR-015**: System MUST redact secrets in logs/errors (token, API key, authorization/cookie-like fields).
- **FR-016**: System MUST tolerate unknown app-server notifications without crashing.
- **FR-017**: System MUST auto-recover app-server process on crash (or fail fast with actionable error message).

### Non-Functional Requirements (Performance & Diagnosability)

- **NFR-001**: System MUST send an acknowledgment message within 2 seconds (P95) after receiving a valid task request.
- **NFR-002**: System MUST provide structured logs containing timestamp, taskId, threadId, turnId, state, and error category.
- **NFR-003**: System MUST maintain deterministic identifiers for task and runtime state correlation.
- **NFR-004**: System MUST keep slash command execution and DM task path available after Discord reconnect.
- **NFR-005**: System MUST run as a single-process local service without exposing extra inbound HTTP ports by default.
- **NFR-006**: System SHOULD complete common short text tasks (non-heavy coding) within 30 seconds under normal network conditions.

### Key Entities _(include if feature involves data)_

- **BridgeTask**: One Discord-originated execution unit; includes `taskId`, `sourceMessageId`, `threadId`, `turnId`, status, timings, and final summary.
- **BridgeRuntimeState**: Persistent singleton snapshot of active thread, current turn, queue depth, and last error.
- **OwnerSessionBinding**: Mapping from owner DM context to current Codex threadId and last active timestamp.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Owner can submit tasks from DM via `/ask` and plain text, with ACK P95 <= 2 seconds.
- **SC-002**: >= 95% of valid tasks finish with `success` over a 7-day run window (excluding upstream model/network outages).
- **SC-003**: `/stop` successfully transitions running tasks to `cancelled` in >= 99% of attempts.
- **SC-004**: 100% of non-owner or non-DM requests are denied with no local task execution.
- **SC-005**: On app-server crash, service recovers automatically or surfaces actionable diagnostic output within 10 seconds.
- **SC-006**: Logs and persisted task records are sufficient to reconstruct end-to-end flow for any failed task.

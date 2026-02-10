# Implementation Plan: Discord Codex App-Server DM Bridge v2

**Branch**: `004-discord-app-server-dm` | **Date**: 2026-02-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-discord-app-server-dm/spec.md`

## Summary

Build a production-usable Discord bridge that is owner-only and DM-only, uses slash commands as first-class control, and executes tasks through a persistent `codex app-server` JSON-RPC session with streamed replies, interruption, and durable local diagnostics.

## Technical Context

**Language/Version**: JavaScript (ESM), Node.js 20+  
**Primary Dependencies**: `discord.js` v14, `dotenv`, Node.js built-ins (`child_process`, `readline`, `fs`)  
**Storage**: Local filesystem (`data/*.jsonl|json`, `logs/*.log`)  
**Testing**: Node built-in `node:test` + focused unit/integration-ish tests on protocol adapter and command routing  
**Target Platform**: Local Linux/macOS/WSL workstation running Codex CLI  
**Project Type**: Single Node service  
**Performance Goals**: ACK P95 <= 2s; incremental stream updates every 1-2s; recover app-server failure visibility <= 10s  
**Constraints**: Owner-only + DM-only hard gate; single active turn; no extra inbound HTTP port; secret redaction required  
**Scale/Scope**: Single owner, one active queue, low QPS (human chat driven)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Intent → Flow/Logix → Code → Runtime**: Intent = Discord 私信远程控制本机 Codex。Flow = DM/Slash 输入 -> owner/dm gate -> queue -> app-server JSON-RPC -> stream -> persistence/log。Code = command router + app-server adapter + state store。Runtime = 单 Node 进程 + 一个 app-server 子进程。
- **docs/specs dependencies**: 仅依赖 `specs/004-discord-app-server-dm/*`；实现过程中持续回写 plan/tasks 与 quickstart。
- **Effect/Logix contracts**: N/A，本项目不涉及 Effect/Logix runtime。
- **IR & anchors**: N/A。
- **Deterministic identity**: `taskId`、`threadId`、`turnId` 均持久化；日志可重建请求链路。
- **Transaction boundary**: 通过单队列避免并发 turn 竞争；无事务内 IO 语义要求。
- **Internal contracts & trial runs**: app-server 封装为显式 adapter；Discord gateway 与 protocol 解析分层，支持 mock 测试。
- **Dual kernels (core/core-ng)**: N/A。
- **Performance budget**: 以 ACK 延迟和 turn 完成时间为主，按任务记录计算 P95。
- **Diagnosability**: 结构化日志 + tasks.jsonl + runtime_state.json，默认开启基础诊断。
- **User-facing performance mental model**: “提交-排队-执行-完成/取消”四阶段，文档与命令输出保持一致。
- **Breaking changes**: 相对 003，命令入口改为 slash + DM，配置项与 README/quickstart 必须同步。
- **Public submodules**: N/A（非包导出项目）。
- **Quality gates**: `npm run lint` + `npm test` + 本地 smoke（启动 bot + app-server 协议回路）。

Result: **PASS**（无未豁免原则冲突）。

## Perf Evidence Plan（MUST）

N/A — 本特性不涉及 Logix runtime 内核/渲染热路径。

## Project Structure

### Documentation (this feature)

```text
specs/004-discord-app-server-dm/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── discord-bridge-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── index.js
├── commands/
│   └── slashCommands.js
├── services/
│   ├── config.js
│   ├── discordClient.js
│   ├── codexAppServerClient.js
│   ├── taskQueue.js
│   ├── runtimeStore.js
│   ├── memoryStore.js
│   └── instanceLock.js
└── utils/
    ├── messageChunker.js
    └── redact.js

tests/
├── codexAppServerClient.test.js
├── slashCommands.test.js
└── redact.test.js

data/
logs/
```

**Structure Decision**: Keep a single-service architecture and isolate the app-server protocol handling in `codexAppServerClient.js` to avoid protocol complexity leaking into Discord handlers.

## Complexity Tracking

No constitution violations requiring explicit exception tracking.

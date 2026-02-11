# codex-discord-bridge-public（v2）

这是一个面向“单操作者”的 Discord ↔ Codex 桥接服务：

- **仅 owner 可用**
- **仅私信（DM）可执行**
- **Slash 命令优先**
- 直接对接 **`codex app-server`** JSON-RPC（不再解析 CLI 文本输出）

## v2 设计目标

本次重写重点是稳定与简化：

- 默认不暴露额外 HTTP 入站端口
- 使用明确的 thread/turn 接口（`thread/*`, `turn/*`）
- 持久化任务与运行状态，便于排障
- 支持**非阻塞分发 + 并发 worker**，避免一个卡住任务拖死整条会话

## 命令（在与 Bot 的私信中）

- `/ask prompt:<文本>`：提交并执行任务
- `/new`：新建并切换控制 thread
- `/thread id:<threadId>`：切换控制 thread
- `/threads [limit]`：查看最近 thread 列表
- `/tasks [limit]`：查看运行中/排队任务与近期快照
- `/history [limit]`：查看本地任务历史
- `/recall [limit]`：把最近历史回填到当前控制 thread
- `/status`：查看当前队列和运行状态
- `/stop [task_id]`：中断当前任务或指定运行中任务
- `/restart`：重启 control app-server 并重新挂载控制 thread

owner 发送普通 DM 文本也会作为任务输入（可配置关闭）。

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 初始化配置：

```bash
cp config.json.example config.json
```

3. （可选）从旧私有 bridge 迁移 token/owner：

```bash
node scripts/migrate-config.js
```

默认读取：`/home/cc/codex-discord-bridge/config.json`

4. 启动服务：

```bash
npm start
```

## 必填配置

`config.json` 至少需要：

- `discordToken`
- `ownerUserId`
- `codexCwd`

## 性能与连续性配置

- `maxConcurrentTasks`（默认 `2`）：并发执行任务数
- `taskThreadMode`（默认 `isolated`）：
  - `isolated`：每个任务独立 thread（推荐，避免互相阻塞）
  - `shared`：任务复用控制 thread
- `historyDefaultLimit`（默认 `10`）：`/history` 默认条数
- `recallDefaultLimit`（默认 `8`）：`/recall` 默认导入条数

## 运行期文件

- `data/tasks.jsonl`：任务生命周期事件流
- `data/runtime_state.json`：运行态快照
- `logs/bridge.log`：结构化日志

## 质量检查

```bash
npm run lint
npm test
```

## 说明

- `config.json` 已加入 `.gitignore`，敏感信息仅保留在本机。
- 对于未知/高噪声 app-server 通知会安全忽略。
- 仓库保留了 v1 历史文件；v2 主入口是 `src/index.js`。

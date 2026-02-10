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

## 命令（在与 Bot 的私信中）

- `/ask prompt:<文本>`：提交并执行任务
- `/new`：新建并切换 thread
- `/thread id:<threadId>`：切换到指定 thread
- `/threads [limit]`：查看最近 thread 列表
- `/status`：查看当前队列和运行状态
- `/stop`：中断当前运行中的 turn

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
- 对于未知的 app-server 通知会安全忽略并记录日志。
- 仓库保留了 v1 历史文件；v2 主入口是 `src/index.js`。

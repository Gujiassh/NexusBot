import { EventEmitter } from "node:events";
import readline from "node:readline";
import { spawn } from "node:child_process";

export function parseJsonLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null;
  if (!line.startsWith("{")) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export class CodexAppServerClient extends EventEmitter {
  constructor(cfg, logger = console) {
    super();
    this.cfg = cfg;
    this.logger = logger;
    this.child = null;
    this.stdoutRl = null;
    this.stderrRl = null;
    this.requestSeq = 0;
    this.pending = new Map();
    this.startPromise = null;
    this.stopped = false;
  }

  _nextId() {
    this.requestSeq += 1;
    return this.requestSeq;
  }

  _log(level, message, context) {
    if (this.logger && typeof this.logger[level] === "function") {
      this.logger[level](message, context);
      return;
    }
    if (level === "error") console.error(message, context || "");
    else if (level === "warn") console.warn(message, context || "");
    else console.log(message, context || "");
  }

  async start() {
    if (this.child && !this.child.killed) return;
    if (this.startPromise) return this.startPromise;

    this.stopped = false;
    this.startPromise = this._startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async _startInternal() {
    const args = ["app-server"];
    const child = spawn(this.cfg.codexCommand, args, {
      cwd: this.cfg.codexCwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.child = child;

    child.on("error", (error) => {
      this._log("error", "codex app-server process error", { error: error?.message || String(error) });
      this._rejectAllPending(new Error(`codex app-server error: ${error?.message || error}`));
      this.emit("exit", { code: null, signal: null, error });
    });

    child.on("exit", (code, signal) => {
      this._log("warn", "codex app-server exited", { code, signal });
      this.child = null;
      this._rejectAllPending(new Error(`codex app-server exited: code=${code}, signal=${signal}`));
      this.emit("exit", { code, signal });
      if (!this.stopped) {
        this.emit("needs-restart", { code, signal });
      }
    });

    this.stdoutRl = readline.createInterface({ input: child.stdout });
    this.stderrRl = readline.createInterface({ input: child.stderr });

    this.stdoutRl.on("line", (line) => this._handleLine(line));
    this.stderrRl.on("line", (line) => {
      this._log("warn", "codex app-server stderr", { line });
    });

    await this.initialize();
  }

  async ensureStarted() {
    if (this.child && !this.child.killed) return;
    await this.start();
  }

  _rejectAllPending(error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  _handleLine(line) {
    const message = parseJsonLine(line);
    if (!message) {
      this.emit("raw", line);
      return;
    }

    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(message.id);

      if (message.error) {
        const err = new Error(message.error?.message || "JSON-RPC error");
        err.code = message.error?.code;
        err.data = message.error?.data;
        pending.reject(err);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      this.emit("notification", message);
      return;
    }

    this.emit("unknown", message);
  }

  async request(method, params = {}, timeoutMs = this.cfg.requestTimeoutMs || 30000) {
    await this.ensureStarted();

    const id = this._nextId();
    const payload = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.child.stdin.write(`${JSON.stringify(payload)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async initialize() {
    return this.request("initialize", {
      clientInfo: {
        name: "discord-codex-bridge-v2",
        version: "0.2.0",
      },
    });
  }

  async startThread() {
    const params = {
      cwd: this.cfg.codexCwd,
      approvalPolicy: this.cfg.codexApprovalPolicy,
      sandbox: this.cfg.codexSandbox,
    };
    if (this.cfg.codexModel) {
      params.model = this.cfg.codexModel;
    }

    const result = await this.request("thread/start", params);
    return result?.thread || null;
  }

  async resumeThread(threadId) {
    if (!threadId) throw new Error("resumeThread requires threadId");

    const params = {
      threadId,
      cwd: this.cfg.codexCwd,
      approvalPolicy: this.cfg.codexApprovalPolicy,
      sandbox: this.cfg.codexSandbox,
    };
    if (this.cfg.codexModel) {
      params.model = this.cfg.codexModel;
    }

    const result = await this.request("thread/resume", params);
    return result?.thread || null;
  }

  async listThreads(limit = 10) {
    const result = await this.request("thread/list", {
      limit,
    });
    return Array.isArray(result?.data) ? result.data : [];
  }

  async interruptTurn(threadId, turnId) {
    if (!threadId || !turnId) {
      throw new Error("interruptTurn requires threadId and turnId");
    }

    return this.request("turn/interrupt", { threadId, turnId });
  }

  async runTurn({ threadId, inputText, onTurnStarted, onDelta, onCommandDelta, timeoutMs }) {
    if (!threadId) throw new Error("runTurn requires threadId");

    const startResult = await this.request("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: inputText,
          text_elements: [],
        },
      ],
    }, this.cfg.requestTimeoutMs || 30000);

    const turnId = startResult?.turn?.id;
    if (!turnId) {
      throw new Error("turn/start did not return turn.id");
    }

    if (typeof onTurnStarted === "function") {
      onTurnStarted(turnId);
    }

    let textOutput = "";
    let commandOutput = "";

    const effectiveTimeout = timeoutMs || this.cfg.turnTimeoutMs || 15 * 60 * 1000;

    return new Promise((resolve, reject) => {
      let done = false;

      const finish = (result, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.off("notification", onNotification);
        this.off("exit", onExit);

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish(null, new Error(`turn timeout after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      const onExit = () => {
        finish(null, new Error("codex app-server exited while turn running"));
      };

      const onNotification = (notification) => {
        const { method, params } = notification || {};
        if (!method || !params) return;

        const sameThread = params.threadId === threadId;
        const sameTurn = params.turnId === undefined || String(params.turnId) === String(turnId);
        if (!sameThread || !sameTurn) return;

        if (method === "item/agentMessage/delta") {
          const delta = String(params.delta || "");
          textOutput += delta;
          if (typeof onDelta === "function") onDelta(delta, textOutput);
          return;
        }

        if (method === "item/commandExecution/outputDelta") {
          const delta = String(params.delta || "");
          commandOutput += delta;
          if (typeof onCommandDelta === "function") onCommandDelta(delta, commandOutput);
          return;
        }

        if (method === "error") {
          if (params.willRetry) return;
          const errorMessage = params.error?.message || params.error?.code || "turn failed";
          finish(null, new Error(errorMessage));
          return;
        }

        if (method === "turn/completed") {
          const status = params.turn?.status || "completed";
          finish({
            threadId,
            turnId,
            status,
            textOutput,
            commandOutput,
            turn: params.turn || null,
          });
        }
      };

      this.on("notification", onNotification);
      this.on("exit", onExit);
    });
  }

  async stop() {
    this.stopped = true;

    if (this.stdoutRl) {
      this.stdoutRl.close();
      this.stdoutRl = null;
    }
    if (this.stderrRl) {
      this.stderrRl.close();
      this.stderrRl = null;
    }

    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }

    this.child = null;
    this._rejectAllPending(new Error("codex app-server stopped"));
  }
}

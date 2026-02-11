let sequence = 0;

export function createTaskId(now = Date.now()) {
  sequence += 1;
  return `T-${now}-${String(sequence).padStart(4, "0")}`;
}

export class TaskQueue {
  constructor({ concurrency = 1, onStateChange } = {}) {
    const parsed = Number.parseInt(String(concurrency), 10);
    this.concurrency = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    this.queue = [];
    this.activeItems = new Map();
    this.onStateChange = typeof onStateChange === "function" ? onStateChange : null;
  }

  get size() {
    return this.queue.length;
  }

  get activeCount() {
    return this.activeItems.size;
  }

  get active() {
    return [...this.activeItems.values()].map((item) => item.meta);
  }

  get pending() {
    return this.queue.map((item) => item.meta);
  }

  async _notify() {
    if (!this.onStateChange) return;

    const activeTasks = this.active;
    await this.onStateChange({
      queueLength: this.queue.length,
      activeTask: activeTasks[0] || null,
      activeTasks,
      activeCount: activeTasks.length,
      concurrency: this.concurrency,
    });
  }

  enqueue(meta, handler) {
    return new Promise((resolve, reject) => {
      this.queue.push({ meta, handler, resolve, reject });
      void this._notify();
      void this._drain();
    });
  }

  async _runItem(token, item) {
    try {
      const result = await item.handler();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeItems.delete(token);
      await this._notify();
      void this._drain();
    }
  }

  async _drain() {
    while (this.activeItems.size < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      const token = Symbol(item?.meta?.taskId || "task");
      this.activeItems.set(token, item);
      await this._notify();
      void this._runItem(token, item);
    }
  }
}

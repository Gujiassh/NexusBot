let sequence = 0;

export function createTaskId(now = Date.now()) {
  sequence += 1;
  return `T-${now}-${String(sequence).padStart(4, "0")}`;
}

export class TaskQueue {
  constructor({ onStateChange } = {}) {
    this.queue = [];
    this.running = false;
    this.current = null;
    this.onStateChange = typeof onStateChange === "function" ? onStateChange : null;
  }

  get size() {
    return this.queue.length;
  }

  get active() {
    return this.current;
  }

  async _notify() {
    if (!this.onStateChange) return;
    await this.onStateChange({
      queueLength: this.queue.length,
      activeTask: this.current?.meta || null,
    });
  }

  enqueue(meta, handler) {
    return new Promise((resolve, reject) => {
      this.queue.push({ meta, handler, resolve, reject });
      void this._notify();
      void this._drain();
    });
  }

  async _drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const item = this.queue.shift();
      this.current = item;
      await this._notify();
      try {
        const result = await item.handler();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.current = null;
        await this._notify();
      }
    }
    this.running = false;
  }
}

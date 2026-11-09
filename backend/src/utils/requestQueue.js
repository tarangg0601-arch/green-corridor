const logger = require('./logger');

class RequestQueue {
  /**
   * @param {number} minIntervalMs - Minimum milliseconds between start of consecutive requests
   * @param {string} name - Identifying name for logging
   */
  constructor(minIntervalMs = 1100, name = 'RequestQueue') {
    this.minIntervalMs = minIntervalMs;
    this.name = name;
    this.queue = [];
    this.processing = false;
    this.lastRequestStartTime = 0;
  }

  /**
   * Enqueue an async task to be executed with rate-limiting.
   * @param {Function} taskFn - () => Promise<any>
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<any>}
   */
  enqueue(taskFn, options = {}) {
    const signal = options.signal;

    if (signal && signal.aborted) {
      const err = new Error(`${this.name}: Request aborted before enqueue`);
      err.name = 'AbortError';
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      const item = {
        taskFn,
        signal,
        resolve,
        reject,
        aborted: false
      };

      if (signal) {
        const onAbort = () => {
          item.aborted = true;
          // If still waiting in queue, remove it immediately
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          const err = new Error(`${this.name}: Request aborted while waiting in queue`);
          err.name = 'AbortError';
          reject(err);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        item.cleanupAbort = () => signal.removeEventListener('abort', onAbort);
      }

      this.queue.push(item);
      this._processNext();
    });
  }

  async _processNext() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item.cleanupAbort) {
        item.cleanupAbort();
      }

      if (item.aborted || (item.signal && item.signal.aborted)) {
        continue;
      }

      // Enforce rate limit interval from the last request start
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestStartTime;
      if (this.lastRequestStartTime > 0 && timeSinceLast < this.minIntervalMs) {
        const waitMs = this.minIntervalMs - timeSinceLast;
        await new Promise(r => setTimeout(r, waitMs));
      }

      // Check again if caller was aborted during the wait
      if (item.aborted || (item.signal && item.signal.aborted)) {
        const err = new Error(`${this.name}: Request aborted while waiting for rate limiter`);
        err.name = 'AbortError';
        item.reject(err);
        continue;
      }

      this.lastRequestStartTime = Date.now();

      try {
        const result = await item.taskFn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }

    this.processing = false;
  }
}

const osrmQueue = new RequestQueue(1100, 'OSRMQueue');
const nominatimQueue = new RequestQueue(1100, 'NominatimQueue');

module.exports = { RequestQueue, osrmQueue, nominatimQueue };

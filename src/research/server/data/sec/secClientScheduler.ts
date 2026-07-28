import type { SecClock } from "./secClientTypes";

const REQUEST_INTERVAL_MILLISECONDS = 125;

type SchedulerOptions = {
  readonly clock: SecClock;
  readonly maxConcurrency: number;
};

class SecRequestScheduler {
  private active = 0;
  private nextStart = 0;
  private readonly waiting: Array<() => void> = [];
  private rateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SchedulerOptions) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      await this.acquireRate();
      return await operation();
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.options.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.active -= 1;
  }

  private async acquireRate(): Promise<void> {
    const previous = this.rateQueue;
    let releaseQueue: () => void = () => undefined;
    this.rateQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previous;
    try {
      const now = this.options.clock.now();
      const wait = Math.max(0, this.nextStart - now);
      if (wait > 0) await this.options.clock.sleep(wait);
      const startedAt = this.options.clock.now();
      this.nextStart =
        Math.max(this.nextStart, startedAt) + REQUEST_INTERVAL_MILLISECONDS;
    } finally {
      releaseQueue();
    }
  }
}

const schedulers = new Map<string, SecRequestScheduler>();

export function organizationScheduler(
  key: string,
  options: SchedulerOptions,
): SecRequestScheduler {
  const existing = schedulers.get(key);
  if (existing !== undefined) return existing;
  const scheduler = new SecRequestScheduler(options);
  schedulers.set(key, scheduler);
  return scheduler;
}

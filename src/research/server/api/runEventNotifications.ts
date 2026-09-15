import { Pool, type PoolClient } from "pg";
import { RunIdSchema } from "../../domain/ids";
import type { ResearchDatabase } from "../persistence/postgres/database";

export interface RunEventWatch {
  wait(milliseconds: number, signals: readonly AbortSignal[]): Promise<boolean>;
  close(): void;
}

/** One LISTEN connection per API instance, regardless of the number of viewers. */
export class RunEventNotifications {
  readonly #subscribers = new Map<string, Set<() => void>>();
  #client: PoolClient | undefined;
  #connecting = false;
  #closed = false;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #retryDelay = 1_000;

  constructor(
    private readonly database: ResearchDatabase,
    private readonly invalidate: (runId: string) => void,
  ) {}

  watch(runId: string): RunEventWatch {
    let pending = false;
    let closed = false;
    const waiting = new Set<(changed: boolean) => void>();
    const changed = () => {
      pending = true;
      for (const finish of waiting) finish(true);
    };
    const subscribers = this.#subscribers.get(runId) ?? new Set();
    subscribers.add(changed);
    this.#subscribers.set(runId, subscribers);
    void this.#connect();
    return {
      wait: async (milliseconds, signals) => {
        if (closed || signals.some((signal) => signal.aborted)) return false;
        if (pending) {
          pending = false;
          return true;
        }
        return await new Promise<boolean>((resolve) => {
          const finish = (value: boolean) => {
            clearTimeout(timer);
            waiting.delete(finish);
            for (const signal of signals)
              signal.removeEventListener("abort", abort);
            if (value) pending = false;
            resolve(value);
          };
          const abort = () => finish(false);
          const timer = setTimeout(abort, milliseconds);
          waiting.add(finish);
          for (const signal of signals)
            signal.addEventListener("abort", abort, { once: true });
        });
      },
      close: () => {
        if (closed) return;
        closed = true;
        for (const finish of waiting) finish(false);
        subscribers.delete(changed);
        if (subscribers.size === 0) this.#subscribers.delete(runId);
        if (this.#subscribers.size === 0) this.#disconnect();
      },
    };
  }

  #wake(runId: string) {
    this.invalidate(runId);
    for (const notify of this.#subscribers.get(runId) ?? []) notify();
  }

  async #connect() {
    if (
      this.#closed ||
      this.#client ||
      this.#connecting ||
      this.#retry ||
      this.#subscribers.size === 0 ||
      !(this.database instanceof Pool)
    )
      return;
    this.#connecting = true;
    let client: PoolClient | undefined;
    try {
      client = await this.database.connect();
      if (this.#closed || this.#subscribers.size === 0) {
        client.release(true);
        return;
      }
      this.#client = client;
      const disconnected = () => {
        if (this.#client !== client) return;
        this.#disconnect();
        this.#scheduleReconnect();
      };
      client.on("error", disconnected);
      client.on("end", disconnected);
      client.on("notification", (message) => {
        if (message.channel !== "stocksembly_run_events") return;
        const runId = RunIdSchema.safeParse(message.payload);
        if (runId.success) this.#wake(runId.data);
      });
      await client.query("LISTEN stocksembly_run_events");
      this.#retryDelay = 1_000;
      // Catch writes during initial connection and any disconnected interval.
      for (const runId of this.#subscribers.keys()) this.#wake(runId);
    } catch {
      if (client === this.#client) this.#disconnect();
      this.#scheduleReconnect();
    } finally {
      this.#connecting = false;
    }
  }

  #scheduleReconnect() {
    if (this.#closed || this.#subscribers.size === 0 || this.#retry) return;
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      void this.#connect();
    }, this.#retryDelay);
    this.#retry.unref();
    this.#retryDelay = Math.min(30_000, this.#retryDelay * 2);
  }

  #disconnect() {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    const client = this.#client;
    this.#client = undefined;
    client?.release(true);
  }

  close() {
    this.#closed = true;
    this.#disconnect();
    this.#subscribers.clear();
  }
}

import { Pool, type PoolClient, type PoolConfig } from "pg";

import { observePool } from "../../lib/observability/metrics";

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  release: (error?: Error | boolean) => void,
) => void;

const ROTATION_WAIT_MS = 40_000;

/** Retry authentication before handing a connection to any SQL caller. */
export class RotationAwarePool extends Pool {
  private readonly recordAcquisition: ReturnType<typeof observePool>;
  constructor(
    configuration: PoolConfig,
    name: "accounts" | "research" | "other" = "other",
  ) {
    super(configuration);
    this.recordAcquisition = observePool(this, name);
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(
    callback?: ConnectCallback,
  ): Promise<PoolClient> | undefined {
    const started = performance.now();
    const connection = this.connectDuringRotation().then(
      (client) => {
        this.recordAcquisition(performance.now() - started, false);
        return client;
      },
      (error: unknown) => {
        this.recordAcquisition(performance.now() - started, true);
        throw error;
      },
    );
    if (!callback) return connection;
    void connection.then(
      (client) => callback(undefined, client, client.release),
      (error: unknown) =>
        callback(
          error instanceof Error ? error : new Error(String(error)),
          undefined,
          () => {},
        ),
    );
    return undefined;
  }

  private async connectDuringRotation(): Promise<PoolClient> {
    const deadline = Date.now() + ROTATION_WAIT_MS;
    let backoff = 1_000;
    for (;;) {
      try {
        return await super.connect();
      } catch (error) {
        const remaining = deadline - Date.now();
        if (
          typeof this.options.password !== "function" ||
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "28P01" ||
          this.ending ||
          remaining <= 0
        )
          throw error;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(backoff, remaining)),
        );
        if (this.ending || Date.now() >= deadline) throw error;
        // pg discards the failed client; the next one invokes the password
        // loader again. No query has been submitted on this acquisition yet.
        backoff = Math.min(backoff * 2, 5_000);
      }
    }
  }
}

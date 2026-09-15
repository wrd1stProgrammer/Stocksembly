import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";
import { withSharedSourceCache } from "../server/data/sharedSourceCache";
import {
  claimStockPreparation,
  finishStockPreparation,
} from "../server/persistence/postgres/stockPreparation";
import { collectInitialEvidence } from "./initialCollectionData";

// Warm source adapters and their AI classification cache without writing run-bound artifacts.
const preparationCas: ArtifactCasPort = {
  put: async ({ bytes, ...descriptor }) => ({
    ...descriptor,
    digest: ArtifactDigestSchema.parse(
      createHash("sha256").update(bytes).digest("hex"),
    ),
    byteLength: bytes.byteLength,
  }),
  get: async () => undefined,
  has: async () => false,
};

export function createStockPreparationWorker(database: Pool, dataRoot: string) {
  let task: Promise<void> | undefined;
  let closed = false;
  const shutdown = new AbortController();
  async function prepare() {
    const claim = await claimStockPreparation(database);
    if (!claim) return;
    const lease = new AbortController();
    const started = Date.now();
    const signal = AbortSignal.any([
      shutdown.signal,
      lease.signal,
      AbortSignal.timeout(10 * 60_000),
    ]);
    const heartbeat = setInterval(() => {
      void database
        .query(
          `UPDATE stock_preparations SET lease_until=now()+interval '90 seconds'
        WHERE symbol=$1 AND lease_token=$2`,
          [claim.symbol, claim.lease_token],
        )
        .then((result) => {
          if (!result.rowCount) lease.abort();
        })
        .catch(() => {
          lease.abort();
          console.warn("STOCK_PREPARATION_HEARTBEAT_FAILED");
        });
    }, 20_000);
    heartbeat.unref();
    try {
      await withSharedSourceCache(
        database,
        () =>
          collectInitialEvidence({
            dataRoot,
            runId: randomUUID(),
            snapshotId: randomUUID(),
            symbol: claim.symbol,
            cas: preparationCas,
            recordAuxiliaryCodexUsage: (usage) => {
              console.info(
                JSON.stringify({
                  event: "stock_preparation_model_usage",
                  symbol: claim.symbol,
                  ...usage,
                }),
              );
            },
          }),
        signal,
      );
      signal.throwIfAborted();
      await finishStockPreparation(
        database,
        claim.symbol,
        claim.lease_token,
        true,
      );
      console.info(
        JSON.stringify({
          event: "stock_preparation_ready",
          symbol: claim.symbol,
          durationMs: Date.now() - started,
        }),
      );
    } catch {
      await finishStockPreparation(
        database,
        claim.symbol,
        claim.lease_token,
        false,
      );
      console.warn(
        JSON.stringify({
          event: "stock_preparation_failed",
          symbol: claim.symbol,
        }),
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
  return {
    tick() {
      if (closed || task) return;
      task = prepare()
        .catch(() => console.warn("STOCK_PREPARATION_UNAVAILABLE"))
        .finally(() => {
          task = undefined;
        });
    },
    async close() {
      closed = true;
      shutdown.abort();
      await task;
    },
  };
}

import { AsyncLocalStorage } from "node:async_hooks";
import type { ResearchDatabase } from "../persistence/postgres/database";

const context = new AsyncLocalStorage<{
  database: ResearchDatabase;
  signal?: AbortSignal;
  hits: number;
  misses: number;
}>();
export function withSharedSourceCache<T>(
  database: ResearchDatabase,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const metrics = {
    database,
    ...(signal ? { signal } : {}),
    hits: 0,
    misses: 0,
  };
  const started = Date.now();
  return context.run(metrics, operation).finally(() => {
    console.info(
      JSON.stringify({
        event: "collection_cache_summary",
        hits: metrics.hits,
        misses: metrics.misses,
        durationMs: Date.now() - started,
      }),
    );
  });
}
export function collectionSignal(): AbortSignal | undefined {
  return context.getStore()?.signal;
}
export async function readSharedSource(namespace: string, key: string) {
  const database = context.getStore()?.database;
  if (!database) return undefined;
  try {
    const result = await database.query<{ body: Buffer; metadata: unknown }>(
      `SELECT body, metadata FROM shared_source_cache WHERE namespace=$1 AND cache_key=$2 AND expires_at > now()`,
      [namespace, key],
    );
    const metrics = context.getStore();
    if (metrics) {
      if (result.rows[0]) metrics.hits += 1;
      else metrics.misses += 1;
    }
    return result.rows[0];
  } catch {
    console.warn("PREFETCH_SHARED_CACHE_READ_FAILED");
    return undefined;
  }
}
export async function writeSharedSource(
  namespace: string,
  key: string,
  bytes: Uint8Array,
  metadata: unknown,
  expiresAt: string,
): Promise<void> {
  const database = context.getStore()?.database;
  if (!database) return;
  try {
    await database.query(
      `INSERT INTO shared_source_cache(namespace,cache_key,body,metadata,expires_at)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(namespace,cache_key) DO UPDATE
      SET body=EXCLUDED.body, metadata=EXCLUDED.metadata, expires_at=EXCLUDED.expires_at
      WHERE COALESCE(EXCLUDED.metadata->>'retrievedAt', EXCLUDED.metadata->>'storedAt') >=
        COALESCE(shared_source_cache.metadata->>'retrievedAt', shared_source_cache.metadata->>'storedAt')`,
      [namespace, key, Buffer.from(bytes), JSON.stringify(metadata), expiresAt],
    );
  } catch {
    console.warn("PREFETCH_SHARED_CACHE_WRITE_FAILED");
  }
}

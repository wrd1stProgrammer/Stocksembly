// Only public metadata belongs here. Access decisions and user data must be
// applied outside this cache. Concurrent misses share the same database read.
export function createPublicMetadataCache<Key extends string, Value>(
  load: (key: Key) => Promise<Value>,
  ttlMs: number,
  now: () => number = Date.now,
): (key: Key) => Promise<Value> {
  const entries = new Map<Key, { expiresAt: number; value: Promise<Value> }>();
  return (key) => {
    const existing = entries.get(key);
    if (existing && existing.expiresAt > now()) return existing.value;
    const entry = {
      expiresAt: Number.POSITIVE_INFINITY,
      value: Promise.resolve().then(() => load(key)),
    };
    entries.set(key, entry);
    entry.value = entry.value.then(
      (value) => {
        entry.expiresAt = now() + ttlMs;
        return value;
      },
      (error: unknown) => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      },
    );
    return entry.value;
  };
}

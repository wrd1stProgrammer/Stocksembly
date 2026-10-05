/** Bound key cardinality and share pending requests, never retain rejected work. */
export function shortCache<T>(ttl: number, maximum = 500) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const existing = entries.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    entries.delete(key);
    if (entries.size >= maximum) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    const value = Promise.resolve().then(load);
    entries.set(key, { expires: Date.now() + ttl, value });
    void value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  };
}

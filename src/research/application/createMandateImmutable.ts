function freezeUnknown(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const nested of Object.values(value)) freezeUnknown(nested, seen);
  Object.freeze(value);
}

export function freezeDeep<T>(value: T): T {
  freezeUnknown(value, new WeakSet<object>());
  return value;
}

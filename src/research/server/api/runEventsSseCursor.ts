export type SseCursorResult =
  | { readonly kind: "accepted"; readonly cursor: number }
  | { readonly kind: "invalid" };

function parseCursor(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function resolveSseCursor(request: Request): SseCursorResult {
  const url = new URL(request.url);
  const queryValues = url.searchParams.getAll("after");
  if (queryValues.length > 1) return { kind: "invalid" };
  const queryRaw = queryValues[0] ?? null;
  const headerRaw = request.headers.get("last-event-id");
  const query = parseCursor(queryRaw);
  const header = parseCursor(headerRaw);
  if (
    (queryRaw !== null && query === undefined) ||
    (headerRaw !== null && header === undefined) ||
    (query !== undefined && header !== undefined && header < query)
  ) {
    return { kind: "invalid" };
  }
  return { kind: "accepted", cursor: header ?? query ?? 0 };
}

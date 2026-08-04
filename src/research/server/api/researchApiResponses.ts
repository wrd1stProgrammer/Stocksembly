export type ApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ACCOUNT_STORE_UNAVAILABLE"
  | "REQUEST_FORBIDDEN"
  | "CONTENT_TYPE_UNSUPPORTED"
  | "BODY_TOO_LARGE"
  | "BODY_INVALID"
  | "IDEMPOTENCY_KEY_INVALID"
  | "REQUEST_INVALID"
  | "SYMBOL_INVALID"
  | "SYMBOL_UNSUPPORTED"
  | "ETF_UNSUPPORTED"
  | "SYMBOL_AMBIGUOUS"
  | "TICKER_CATALOG_UNAVAILABLE"
  | "QUESTION_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "CREDITS_INSUFFICIENT"
  | "RESEARCH_UNREADY"
  | "RESEARCH_QUEUE_UNAVAILABLE"
  | "QUEUE_FULL"
  | "DISK_LOW"
  | "CURSOR_INVALID"
  | "EVENT_CURSOR_INVALID"
  | "EVENT_LINEAGE_PRUNED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "COMMAND_NOT_ALLOWED"
  | "QUESTION_QUOTA_EXHAUSTED"
  | "QUESTION_ACTIVE"
  | "QUESTION_GROUNDING_UNAVAILABLE"
  | "FOLLOW_UP_REQUIRED";

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export function apiJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

export function apiError(status: number, code: ApiErrorCode): Response {
  return apiJson({ error: { code } }, status);
}

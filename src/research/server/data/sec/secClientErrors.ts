export const SEC_CLIENT_ERROR_CODES = [
  "SEC_REQUEST_INVALID",
  "SEC_EMPTY_RESPONSE",
  "SEC_UNEXPECTED_MEDIA_TYPE",
  "SEC_SCHEMA_INVALID",
  "SEC_RESPONSE_TOO_LARGE",
  "SEC_REDIRECT_FORBIDDEN",
  "SEC_HTTP_STATUS",
  "SEC_RETRY_EXHAUSTED",
  "SEC_TRANSPORT_TIMEOUT",
  "SEC_CACHE_CORRUPT",
] as const;
export type SecClientErrorCode = (typeof SEC_CLIENT_ERROR_CODES)[number];

type SecClientErrorDetails = {
  readonly status?: number;
  readonly limitBytes?: number;
  readonly attempts?: number;
};

export class SecClientError extends Error {
  readonly name = "SecClientError";
  readonly status: number | undefined;
  readonly limitBytes: number | undefined;
  readonly attempts: number | undefined;

  constructor(
    readonly code: SecClientErrorCode,
    details: SecClientErrorDetails = {},
  ) {
    super(code);
    this.status = details.status;
    this.limitBytes = details.limitBytes;
    this.attempts = details.attempts;
  }
}

export class SecTransportTimeoutError extends Error {
  readonly name = "SecTransportTimeoutError";
  readonly code = "SEC_TRANSPORT_TIMEOUT";

  constructor() {
    super("SEC_TRANSPORT_TIMEOUT");
  }
}

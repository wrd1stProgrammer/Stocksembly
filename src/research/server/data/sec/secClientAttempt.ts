import type { SecCacheEntry } from "./secClientCache";
import { SecClientError } from "./secClientErrors";
import type { SecRequest } from "./secClientRequest";
import type { SecWireAdapter, SecWireResponse } from "./secClientTypes";
import { readValidatedSecBody } from "./secClientValidation";

type CompletedAttempt = {
  readonly kind: "completed";
  readonly response: SecWireResponse;
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

type RevalidatedAttempt = {
  readonly kind: "revalidated";
  readonly response: SecWireResponse;
  readonly cache: SecCacheEntry;
};

type RetryAttempt = {
  readonly kind: "retry";
  readonly status: number;
  readonly retryAfter?: string;
};

export type SecAttemptOutcome =
  | CompletedAttempt
  | RevalidatedAttempt
  | RetryAttempt;

export async function executeSecAttempt(options: {
  readonly adapter: SecWireAdapter;
  readonly request: SecRequest;
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly cache: SecCacheEntry | undefined;
  readonly timeoutMilliseconds: number;
  readonly limitBytes: number;
}): Promise<SecAttemptOutcome> {
  const response = await options.adapter({
    url: options.url,
    headers: options.headers,
    timeoutMilliseconds: options.timeoutMilliseconds,
  });
  if (response.status === 429 || response.status >= 500) {
    response.abort();
    return {
      kind: "retry",
      status: response.status,
      ...(response.headers["retry-after"] === undefined
        ? {}
        : { retryAfter: response.headers["retry-after"] }),
    };
  }
  if (response.status === 304) {
    if (options.cache === undefined)
      throw new SecClientError("SEC_CACHE_CORRUPT");
    response.abort();
    return { kind: "revalidated", response, cache: options.cache };
  }
  if (response.status >= 300 && response.status < 400) {
    response.abort();
    throw new SecClientError("SEC_REDIRECT_FORBIDDEN", {
      status: response.status,
    });
  }
  if (response.status !== 200) {
    response.abort();
    throw new SecClientError("SEC_HTTP_STATUS", { status: response.status });
  }
  const validated = await readValidatedSecBody({
    request: options.request,
    response,
    limitBytes: options.limitBytes,
  });
  return {
    kind: "completed",
    response,
    bytes: validated.bytes,
    contentType: validated.contentType,
  };
}

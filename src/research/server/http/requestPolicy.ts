const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED = { kind: "allowed" } as const;
const FORBIDDEN = { kind: "rejected", status: 403 } as const;
const BODY_TOO_LARGE = { kind: "rejected", status: 413 } as const;
const CONTENT_TYPE_UNSUPPORTED = { kind: "rejected", status: 415 } as const;

export type RequestPolicyResult =
  | typeof ALLOWED
  | typeof BODY_TOO_LARGE
  | typeof CONTENT_TYPE_UNSUPPORTED
  | typeof FORBIDDEN;

export type RequestPolicyOptions = {
  readonly allowedHost: string;
  readonly allowedOrigin: string;
  readonly mutation: boolean;
};

function localOriginAliases(origin: string): readonly string[] {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return [origin];
  }
  if (
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1" &&
    parsed.hostname !== "[::1]"
  )
    return [origin];

  return ["localhost", "127.0.0.1", "[::1]"].map((hostname) => {
    const alias = new URL(parsed.href);
    alias.hostname = hostname;
    return alias.origin;
  });
}

function localHostAliases(origin: string): readonly string[] {
  return localOriginAliases(origin).map((value) => new URL(value).host);
}

function hasSafeFrameworkForwarding(
  headers: Headers,
  options: RequestPolicyOptions,
): boolean {
  let hasFrameworkForwarding = false;
  for (const [name] of headers) {
    if (name === "forwarded" || name.startsWith("access-control-request-")) {
      return false;
    }
    if (name.startsWith("x-forwarded-")) {
      if (
        name !== "x-forwarded-for" &&
        name !== "x-forwarded-host" &&
        name !== "x-forwarded-port" &&
        name !== "x-forwarded-proto"
      ) {
        return false;
      }
      hasFrameworkForwarding = true;
    }
  }
  if (!hasFrameworkForwarding) {
    return true;
  }
  const allowedOrigin = new URL(options.allowedOrigin);
  const forwardedFor = headers.get("x-forwarded-for");
  return (
    localHostAliases(options.allowedOrigin).includes(
      headers.get("x-forwarded-host") ?? "",
    ) &&
    headers.get("x-forwarded-port") ===
      (allowedOrigin.port ||
        (allowedOrigin.protocol === "https:" ? "443" : "80")) &&
    headers.get("x-forwarded-proto") === allowedOrigin.protocol.slice(0, -1) &&
    forwardedFor !== null &&
    forwardedFor.length > 0
  );
}

function hasSafeQueryContext(
  request: Request,
  options: RequestPolicyOptions,
): boolean {
  let allowedOrigin: URL;
  try {
    allowedOrigin = new URL(options.allowedOrigin);
  } catch {
    return false;
  }
  if (
    allowedOrigin.origin !== options.allowedOrigin ||
    allowedOrigin.host !== options.allowedHost ||
    (allowedOrigin.protocol !== "http:" && allowedOrigin.protocol !== "https:")
  )
    return false;
  if (request.headers.get("host") !== options.allowedHost) {
    if (
      !localHostAliases(options.allowedOrigin).includes(
        request.headers.get("host") ?? "",
      )
    )
      return false;
  }
  if (
    request.method === "OPTIONS" ||
    !hasSafeFrameworkForwarding(request.headers, options)
  ) {
    return false;
  }
  const origin = request.headers.get("origin");
  if (
    origin !== null &&
    !localOriginAliases(options.allowedOrigin).includes(origin)
  ) {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    fetchSite === null || fetchSite === "none" || fetchSite === "same-origin"
  );
}

async function bodyRejectionStatus(
  request: Request,
): Promise<403 | 413 | undefined> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength)) {
      return 403;
    }
    if (Number(declaredLength) > MAX_JSON_BYTES) {
      return 413;
    }
  }
  const body = request.clone().body;
  if (body === null) {
    return undefined;
  }
  const reader = body.getReader();
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return undefined;
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_JSON_BYTES) {
        return 413;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function enforceRequestPolicy(
  request: Request,
  options: RequestPolicyOptions,
): Promise<RequestPolicyResult> {
  if (!hasSafeQueryContext(request, options)) {
    return FORBIDDEN;
  }
  if (!options.mutation) {
    return ALLOWED;
  }
  if (
    !localOriginAliases(options.allowedOrigin).includes(
      request.headers.get("origin") ?? "",
    ) ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  ) {
    return FORBIDDEN;
  }
  if (request.headers.get("content-type") !== "application/json") {
    return CONTENT_TYPE_UNSUPPORTED;
  }
  const rejectionStatus = await bodyRejectionStatus(request);
  if (rejectionStatus === 403) {
    return FORBIDDEN;
  }
  return rejectionStatus === 413 ? BODY_TOO_LARGE : ALLOWED;
}

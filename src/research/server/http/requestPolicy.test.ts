import { describe, expect, it } from "vitest";
import { enforceRequestPolicy } from "./requestPolicy";

const basePolicy = {
  allowedHost: "localhost:3000",
  allowedOrigin: "http://localhost:3000",
} as const;

function queryRequest(headers: HeadersInit): Request {
  return new Request("http://localhost:3000/api/research/runs", { headers });
}

function mutationRequest(headers: HeadersInit, body = "{}"): Request {
  return new Request("http://localhost:3000/api/research/runs", {
    method: "POST",
    headers,
    body,
  });
}

describe("local HTTP request policy", () => {
  it.each([
    ["localhost", { host: "localhost:3000" }],
    ["IPv4 loopback", { host: "127.0.0.1:3000" }],
    ["IPv6 loopback", { host: "[::1]:3000" }],
    [
      "same-origin browser query",
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    ],
    ["direct automation query", { host: "localhost:3000" }],
  ] as const)("allows a %s query", async (_case, headers) => {
    // Given
    const request = queryRequest(headers);

    // When
    const host = new Headers(headers).get("host");
    const result = await enforceRequestPolicy(request, {
      allowedHost: host ?? basePolicy.allowedHost,
      allowedOrigin:
        host === null ? basePolicy.allowedOrigin : `http://${host}`,
      mutation: false,
    });

    // Then
    expect(result).toEqual({ kind: "allowed" });
  });

  it.each([
    ["public Host", { host: "192.168.1.20:3000" }],
    ["evil Host", { host: "evil.example:3000" }],
    ["DNS-rebinding Host", { host: "localhost.attacker.example:3000" }],
    ["Forwarded", { host: "localhost:3000", forwarded: "for=127.0.0.1" }],
    [
      "X-Forwarded-Host",
      { host: "localhost:3000", "x-forwarded-host": "localhost:3000" },
    ],
    [
      "X-Forwarded-For",
      { host: "localhost:3000", "x-forwarded-for": "127.0.0.1" },
    ],
    ["invalid Origin", { host: "localhost:3000", origin: "not-an-origin" }],
    ["cross Origin", { host: "localhost:3000", origin: "http://evil.example" }],
    [
      "cross-site Fetch Metadata",
      { host: "localhost:3000", "sec-fetch-site": "cross-site" },
    ],
    [
      "same-site Fetch Metadata",
      { host: "localhost:3000", "sec-fetch-site": "same-site" },
    ],
  ] as const)("rejects a query with %s", async (_case, headers) => {
    // Given
    const request = queryRequest(headers);

    // When
    const result = await enforceRequestPolicy(request, {
      ...basePolicy,
      mutation: false,
    });

    // Then
    expect(result).toEqual({ kind: "rejected", status: 403 });
  });

  it("rejects a CORS preflight without reflecting CORS data", async () => {
    // Given
    const request = new Request("http://localhost:3000/api/research/runs", {
      method: "OPTIONS",
      headers: {
        host: "localhost:3000",
        origin: "http://evil.example",
        "access-control-request-method": "POST",
      },
    });

    // When
    const result = await enforceRequestPolicy(request, {
      ...basePolicy,
      mutation: false,
    });

    // Then
    expect(result).toEqual({ kind: "rejected", status: 403 });
  });

  it("allows an exact same-origin JSON mutation within 64 KiB", async () => {
    // Given
    const request = mutationRequest(
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "content-length": "1",
      },
      "x".repeat(65_536),
    );

    // When
    const result = await enforceRequestPolicy(request, {
      ...basePolicy,
      mutation: true,
    });

    // Then
    expect(result).toEqual({ kind: "allowed" });
  });

  it.each([
    [
      "missing Origin",
      {
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      "{}",
      403,
    ],
    [
      "mismatched Origin",
      {
        host: "127.0.0.1:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      "{}",
      403,
    ],
    [
      "missing Fetch Metadata",
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      "{}",
      403,
    ],
    [
      "cross-site Fetch Metadata",
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      "{}",
      403,
    ],
    [
      "non-exact content type",
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json; charset=utf-8",
      },
      "{}",
      415,
    ],
    [
      "oversized JSON",
      {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "content-length": "1",
      },
      "x".repeat(65_537),
      413,
    ],
  ] as const)(
    "rejects a mutation with %s",
    async (_case, headers, body, status) => {
      // Given
      const request = mutationRequest(headers, body);

      // When
      const result = await enforceRequestPolicy(request, {
        ...basePolicy,
        mutation: true,
      });

      // Then
      expect(result).toEqual({ kind: "rejected", status });
    },
  );
});

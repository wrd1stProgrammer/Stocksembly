import { describe, expect, it } from "vitest";
import { enforceRequestPolicy } from "./requestPolicy";

const basePolicy = {
  allowedHost: "localhost:3000",
  allowedOrigin: "http://localhost:3000",
  mutation: false,
} as const;

const allowedHeaders = ["127.0.0.1", "::ffff:127.0.0.1", "::1"].map(
  (forwardedFor) => ({
    host: "localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
    "x-forwarded-for": forwardedFor,
    "x-forwarded-port": "3000",
  }),
);

const rejectedHeaders = [
  { "x-forwarded-host": "evil.example:3000" },
  { "x-forwarded-proto": "https" },
  { "x-forwarded-for": "127.0.0.1, 10.0.0.2" },
  { "x-forwarded-for": "10.0.0.2" },
  { "x-forwarded-for": "fe80::1%lo0" },
  {
    host: "localhost.attacker.example:3000",
    "x-forwarded-host": "localhost.attacker.example:3000",
  },
  { "x-forwarded-port": "3001" },
  { "x-forwarded-prefix": "/api" },
].map((overrides) => ({ ...allowedHeaders[0], ...overrides }));

describe("framework forwarding request policy", () => {
  it("accepts only the canonical Next tuple from direct loopback", async () => {
    // Given
    const headerCases = [...allowedHeaders, ...rejectedHeaders];

    // When
    const results = await Promise.all(
      headerCases.map((headers) =>
        enforceRequestPolicy(
          new Request("http://localhost:3000/api/research/runs", { headers }),
          basePolicy,
        ),
      ),
    );

    // Then
    expect(results).toEqual([
      { kind: "allowed" },
      { kind: "allowed" },
      { kind: "allowed" },
      ...rejectedHeaders.map(() => ({ kind: "rejected", status: 403 })),
    ]);
  });
});

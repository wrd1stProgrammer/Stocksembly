import { mkdtemp, rm } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSecClient, type SecWireAdapter } from "./secClient";
import { fakeClock } from "./secClient.testSupport";
import { configureSecIdentity } from "./secIdentityConfig";

const TEST_IDENTITY = {
  organization: "Synthetic Transport Lab",
  contactEmail: "wire-test@example.invalid",
} as const;
const TEST_BODY = JSON.stringify({
  cik: "0000320193",
  name: "Synthetic Issuer",
  filings: {
    recent: {
      accessionNumber: [],
      form: [],
      filingDate: [],
      primaryDocument: [],
    },
    files: [],
  },
});
const roots: string[] = [];
const servers: Server[] = [];

function responseHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") normalized[name] = value;
    else if (Array.isArray(value)) normalized[name] = value.join(", ");
  }
  return Object.freeze(normalized);
}

function localAdapter(port: number): SecWireAdapter {
  return (wireRequest) =>
    new Promise((resolve, reject) => {
      const outbound = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: wireRequest.url.pathname,
          method: "GET",
          headers: wireRequest.headers,
        },
        (response) => {
          resolve({
            status: response.statusCode ?? 0,
            headers: responseHeaders(response.headers),
            body: response,
            abort: () => response.destroy(),
          });
        },
      );
      outbound.once("error", reject);
      outbound.end();
    });
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(stopServer));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("SEC transport local HTTP integration double", () => {
  it("sends the derived identity only on wire and revalidates cached bytes", async () => {
    // Given
    const dataRoot = await mkdtemp(
      join(tmpdir(), "stocksembly-sec-http-double-"),
    );
    roots.push(dataRoot);
    await configureSecIdentity(dataRoot, TEST_IDENTITY);
    const receivedHeaders: Array<
      Readonly<Record<string, string | string[] | undefined>>
    > = [];
    let requestCount = 0;
    const server = createServer((request, response) => {
      requestCount += 1;
      receivedHeaders.push(request.headers);
      if (requestCount === 1) {
        response.writeHead(200, {
          "content-type": "application/json",
          etag: '"local-v1"',
          "last-modified": "Tue, 21 Jul 2026 00:00:00 GMT",
        });
        response.end(TEST_BODY);
        return;
      }
      response.writeHead(304, { etag: '"local-v1"' });
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("local SEC test server did not bind TCP");
    const clock = fakeClock();
    const client = createSecClient({
      dataRoot,
      adapter: localAdapter(address.port),
      clock,
    });

    // When
    const first = await client.fetch({
      kind: "submissions",
      cik: "0000320193",
    });
    await clock.sleep(60 * 60 * 1_000 + 1);
    const second = await client.fetch({
      kind: "submissions",
      cik: "0000320193",
    });

    // Then
    expect(receivedHeaders[0]?.["user-agent"]).toBe(
      "Stocksembly/1.0 (Synthetic Transport Lab; wire-test@example.invalid)",
    );
    expect(receivedHeaders[1]?.["if-none-match"]).toBe('"local-v1"');
    expect(receivedHeaders[1]?.["if-modified-since"]).toBe(
      "Tue, 21 Jul 2026 00:00:00 GMT",
    );
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes));
    expect(second.provenance).toMatchObject({
      responseStatus: 304,
      cacheStatus: "revalidated",
    });
    expect(JSON.stringify(second)).not.toContain(TEST_IDENTITY.organization);
    expect(JSON.stringify(second)).not.toContain(TEST_IDENTITY.contactEmail);
  });
});

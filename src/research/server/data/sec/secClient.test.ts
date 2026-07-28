import { describe, expect, it } from "vitest";
import {
  createSecClient,
  SEC_MAX_RESPONSE_BYTES,
  type SecWireAdapter,
} from "./secClient";
import "./secClient.integration.testCases";
import "./secClientIdentityBinding.testCases";
import "./secClientRequest.testCases";
import "./secClientRetry.testCases";
import {
  fakeClock,
  jsonResponse,
  SYNTHETIC_IDENTITY,
  temporaryDataRoot,
} from "./secClient.testSupport";

describe("SEC fair-access transport", () => {
  it("serves fresh mutable SEC data without another network request", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const clock = fakeClock();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      return jsonResponse(undefined, { etag: '"submissions-v1"' });
    };
    const client = createSecClient({ dataRoot, adapter, clock });

    // When
    const first = await client.fetch({
      kind: "submissions",
      cik: "0000320193",
    });
    const second = await client.fetch({
      kind: "submissions",
      cik: "0000320193",
    });

    // Then
    expect(calls).toBe(1);
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes));
    expect(second.provenance.cacheStatus).toBe("hit");
  });

  it("keeps immutable filing documents reusable without revalidation", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const clock = fakeClock();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: (async function* () {
          yield Buffer.from("<html><body>filing fixture</body></html>");
        })(),
        abort: () => undefined,
      };
    };
    const client = createSecClient({ dataRoot, adapter, clock });
    const filing = {
      kind: "filing_document",
      cik: "0000320193",
      accessionNumber: "0000320193-26-000001",
      primaryDocument: "aapl-20260724.htm",
    } as const;

    // When
    const first = await client.fetch(filing);
    await clock.sleep(366 * 24 * 60 * 60 * 1_000);
    const second = await client.fetch(filing);

    // Then
    expect(calls).toBe(1);
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes));
    expect(second.provenance.cacheStatus).toBe("hit");
  });

  it("derives the request-only User-Agent and redacts identity from outputs", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const seenHeaders: Array<Readonly<Record<string, string>>> = [];
    const adapter: SecWireAdapter = async (request) => {
      seenHeaders.push(request.headers);
      return jsonResponse();
    };

    // When
    const result = await createSecClient({ dataRoot, adapter }).fetch({
      kind: "submissions",
      cik: "0000320193",
    });

    // Then
    expect(seenHeaders[0]?.["user-agent"]).toBe(
      "Stocksembly/1.0 (Synthetic Research Lab; sec-test@example.invalid)",
    );
    expect(JSON.stringify(result)).not.toContain(
      SYNTHETIC_IDENTITY.organization,
    );
    expect(JSON.stringify(result)).not.toContain(
      SYNTHETIC_IDENTITY.contactEmail,
    );
    expect(result.provenance.identityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("admits at most eight starts per second and bounds concurrent transfers", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const clock = fakeClock();
    const starts: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const pendingBatch: Array<() => void> = [];
    const adapter: SecWireAdapter = async () => {
      starts.push(clock.now());
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        pendingBatch.push(resolve);
        if (pendingBatch.length === 3) {
          const batch = pendingBatch.splice(0);
          queueMicrotask(() =>
            batch.forEach((release) => {
              release();
            }),
          );
        }
      });
      active -= 1;
      return jsonResponse();
    };
    const client = createSecClient({
      dataRoot,
      adapter,
      clock,
      maxConcurrency: 3,
    });

    // When
    const requests = Array.from({ length: 9 }, () =>
      client.fetch({ kind: "submissions", cik: "0000320193" }),
    );
    const results = await Promise.all(requests);

    // Then
    expect(results).toHaveLength(9);
    expect(maximumActive).toBeLessThanOrEqual(3);
    expect(
      starts
        .slice(1)
        .every((value, index) => value - (starts[index] ?? 0) >= 125),
    ).toBe(true);
  });

  it("honors Retry-After and retries bounded transient classes", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const clock = fakeClock();
    let attempts = 0;
    const adapter: SecWireAdapter = async () => {
      attempts += 1;
      if (attempts === 1)
        return {
          status: 429,
          headers: { "retry-after": "2", "content-type": "application/json" },
          body: (async function* () {})(),
          abort: () => undefined,
        };
      return jsonResponse();
    };

    // When
    await createSecClient({ dataRoot, adapter, clock }).fetch({
      kind: "submissions",
      cik: "0000320193",
    });

    // Then
    expect(attempts).toBe(2);
    expect(clock.sleeps).toContain(2_000);
  });

  it.each([
    ["empty body", jsonResponse(""), "SEC_EMPTY_RESPONSE"],
    [
      "HTML masquerading as JSON",
      jsonResponse("<html>blocked</html>", { "content-type": "text/html" }),
      "SEC_UNEXPECTED_MEDIA_TYPE",
    ],
    [
      "schema-invalid JSON",
      jsonResponse('{"message":"ok"}'),
      "SEC_SCHEMA_INVALID",
    ],
    [
      "off-host redirect",
      {
        status: 302,
        headers: { location: "https://outside.invalid/capture" },
        body: (async function* () {})(),
        abort: () => undefined,
      },
      "SEC_REDIRECT_FORBIDDEN",
    ],
  ])("rejects %s", async (_label, response, code) => {
    // Given
    const dataRoot = await temporaryDataRoot();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      return response;
    };

    // When / Then
    await expect(
      createSecClient({ dataRoot, adapter }).fetch({
        kind: "submissions",
        cik: "0000320193",
      }),
    ).rejects.toMatchObject({ name: "SecClientError", code });
    expect(calls).toBe(1);
  });

  it("stops an oversized stream at the 25 MiB cap", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    let chunksTransferred = 0;
    let aborted = false;
    const adapter: SecWireAdapter = async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: (async function* () {
        while (chunksTransferred < 30) {
          chunksTransferred += 1;
          yield Buffer.alloc(1024 * 1024);
        }
      })(),
      abort: () => {
        aborted = true;
      },
    });

    // When / Then
    await expect(
      createSecClient({ dataRoot, adapter }).fetch({
        kind: "submissions",
        cik: "0000320193",
      }),
    ).rejects.toMatchObject({
      code: "SEC_RESPONSE_TOO_LARGE",
      limitBytes: SEC_MAX_RESPONSE_BYTES,
    });
    expect(chunksTransferred).toBe(26);
    expect(aborted).toBe(true);
  });

  it("rejects caller-shaped URLs before opening the wire and freezes provenance", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      return jsonResponse();
    };
    const client = createSecClient({ dataRoot, adapter });

    // When / Then
    await expect(
      client.fetch({
        kind: "filing_document",
        cik: "0000320193",
        accessionNumber: "0000320193-26-000001",
        primaryDocument: "https://outside.invalid/document.htm",
      }),
    ).rejects.toMatchObject({ code: "SEC_REQUEST_INVALID" });
    expect(calls).toBe(0);

    const result = await client.fetch({
      kind: "submissions",
      cik: "0000320193",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(Object.isFrozen(result.provenance.responseHeaders)).toBe(true);
  });
});

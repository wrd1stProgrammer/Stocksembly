import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSecClient,
  type SecClock,
  SecTransportTimeoutError,
  type SecWireAdapter,
} from "./secClient";
import { configureSecIdentity } from "./secIdentityConfig";

const roots: string[] = [];
const BODY = JSON.stringify({
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

async function setup(): Promise<string> {
  const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-sec-retry-"));
  roots.push(dataRoot);
  await configureSecIdentity(dataRoot, {
    organization: "Synthetic Retry Lab",
    contactEmail: "retry-test@example.invalid",
  });
  return dataRoot;
}

function clock(): SecClock & { readonly sleeps: number[] } {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    isoNow: () => new Date(now).toISOString(),
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("SEC bounded retries", () => {
  it("retries a timeout and a 5xx before returning validated bytes", async () => {
    // Given
    const dataRoot = await setup();
    const controlledClock = clock();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      if (calls === 1) throw new SecTransportTimeoutError();
      if (calls === 2)
        return {
          status: 503,
          headers: { "content-type": "application/json" },
          body: (async function* () {})(),
          abort: () => undefined,
        };
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: (async function* () {
          yield Buffer.from(BODY);
        })(),
        abort: () => undefined,
      };
    };

    // When
    const result = await createSecClient({
      dataRoot,
      adapter,
      clock: controlledClock,
    }).fetch({ kind: "submissions", cik: "0000320193" });

    // Then
    expect(result.provenance.responseStatus).toBe(200);
    expect(calls).toBe(3);
    expect(controlledClock.sleeps).toEqual(expect.arrayContaining([250, 500]));
  });

  it("stops after three retryable responses", async () => {
    // Given
    const dataRoot = await setup();
    let calls = 0;
    const adapter: SecWireAdapter = async () => {
      calls += 1;
      return {
        status: 500,
        headers: { "content-type": "application/json" },
        body: (async function* () {})(),
        abort: () => undefined,
      };
    };

    // When / Then
    await expect(
      createSecClient({ dataRoot, adapter, clock: clock() }).fetch({
        kind: "submissions",
        cik: "0000320193",
      }),
    ).rejects.toMatchObject({
      name: "SecClientError",
      code: "SEC_RETRY_EXHAUSTED",
      status: 500,
      attempts: 3,
    });
    expect(calls).toBe(3);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { SecClock, SecWireResponse } from "./secClient";
import { configureSecIdentity } from "./secIdentityConfig";

export const SYNTHETIC_IDENTITY = {
  organization: "Synthetic Research Lab",
  contactEmail: "sec-test@example.invalid",
} as const;

export const VALID_SUBMISSIONS = JSON.stringify({
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

export async function temporaryDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stocksembly-sec-client-"));
  roots.push(root);
  await configureSecIdentity(root, SYNTHETIC_IDENTITY);
  return root;
}

export function jsonResponse(
  body = VALID_SUBMISSIONS,
  headers: Readonly<Record<string, string>> = {},
): SecWireResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
    body: (async function* () {
      yield Buffer.from(body);
    })(),
    abort: () => undefined,
  };
}

export function fakeClock(): SecClock & { readonly sleeps: number[] } {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    isoNow: () => new Date(now).toISOString(),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

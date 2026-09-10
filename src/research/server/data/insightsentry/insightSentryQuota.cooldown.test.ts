import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  InsightSentryCooldownError,
  InsightSentryQuotaGovernor,
  writeInsightSentryRetryIntent,
} from "./insightSentryQuota";

it("defers queued requests after a shared429 cooldown without calling upstream", async () => {
  const root = await mkdtemp(join(tmpdir(), "quota-cooldown-"));
  try {
    const governor = new InsightSentryQuotaGovernor(root);
    let calls = 0;
    const clock = () => Date.parse("2026-07-24T00:00:00.000Z");
    const results = await Promise.allSettled([
      governor.run(async () => {
        calls += 1;
        governor.coolDown("2026-07-24T00:02:00.000Z");
      }, clock),
      governor.run(async () => {
        calls += 1;
      }, clock),
      governor.run(async () => {
        calls += 1;
      }, clock),
    ]);
    expect(calls).toBe(1);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "rejected",
    ]);
    const rejected = results[1];
    if (rejected?.status !== "rejected")
      throw new Error("Expected deferred request");
    expect(rejected.reason).toBeInstanceOf(InsightSentryCooldownError);
    expect(rejected.reason.retryAt).toBe("2026-07-24T00:02:00.000Z");
    await governor.run(
      async () => {
        calls += 1;
      },
      () => Date.parse("2026-07-24T00:02:01.000Z"),
    );
    expect(calls).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("hydrates a persisted429 cooldown on worker restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "quota-restart-"));
  try {
    await writeInsightSentryRetryIntent(root, {
      cacheKey: "a".repeat(64),
      classification: "rate_limited",
      retryAt: "2026-07-24T00:02:00.000Z",
      ordinal: 1,
      endpoint: "/quotes",
      status: 429,
    });
    const governor = new InsightSentryQuotaGovernor(root);
    let called = false;
    await expect(
      governor.run(
        async () => {
          called = true;
        },
        () => Date.parse("2026-07-24T00:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(InsightSentryCooldownError);
    expect(called).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

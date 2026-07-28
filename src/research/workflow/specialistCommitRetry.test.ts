import { describe, expect, it } from "vitest";
import { retryRejectedCommit } from "./specialistCommitRetry";

describe("retryRejectedCommit", () => {
  it("retries a rejected specialist commit instead of losing a valid memo", async () => {
    let calls = 0;

    const result = await retryRejectedCommit(async () => {
      calls += 1;
      return calls === 1
        ? ({ kind: "rejected" } as const)
        : ({ kind: "committed", sequence: 12 } as const);
    });

    expect(result).toEqual({ kind: "committed", sequence: 12 });
    expect(calls).toBe(2);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withCacheFillLock } from "./cacheFillLock";

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("cache fill lock ownership", () => {
  it("does not let an expired owner remove its successor lock", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-lock-"));
    const firstGate = deferred();
    const firstStarted = deferred();
    const secondGate = deferred();
    const secondStarted = deferred();
    let thirdEntered = false;
    const policy = {
      retryMilliseconds: 2,
      waitMilliseconds: 1_000,
      staleMilliseconds: 20,
      heartbeatMilliseconds: 10_000,
    };

    try {
      const first = withCacheFillLock({
        dataRoot,
        namespace: "test",
        key: "shared",
        policy,
        operation: async () => {
          firstStarted.resolve();
          await firstGate.promise;
        },
      });
      await firstStarted.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      const second = withCacheFillLock({
        dataRoot,
        namespace: "test",
        key: "shared",
        policy,
        operation: async () => {
          secondStarted.resolve();
          await secondGate.promise;
        },
      });
      await secondStarted.promise;

      firstGate.resolve();
      await first;
      const third = withCacheFillLock({
        dataRoot,
        namespace: "test",
        key: "shared",
        policy,
        operation: async () => {
          thirdEntered = true;
        },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(thirdEntered).toBe(false);

      secondGate.resolve();
      await second;
      await third;
      expect(thirdEntered).toBe(true);
    } finally {
      firstGate.resolve();
      secondGate.resolve();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});

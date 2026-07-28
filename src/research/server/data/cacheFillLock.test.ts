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
  it("keeps a successor serialized after the current owner releases", async () => {
    const firstGate = deferred();
    const firstStarted = deferred();
    const secondGate = deferred();
    const secondStarted = deferred();
    let thirdEntered = false;
    const common = {
      dataRoot: "/tmp/stocksembly-lock-test",
      namespace: "test",
      key: "shared",
    } as const;

    const first = withCacheFillLock({
      ...common,
      operation: async () => {
        firstStarted.resolve();
        await firstGate.promise;
      },
    });
    await firstStarted.promise;
    const second = withCacheFillLock({
      ...common,
      operation: async () => {
        secondStarted.resolve();
        await secondGate.promise;
      },
    });

    firstGate.resolve();
    await first;
    await secondStarted.promise;
    const third = withCacheFillLock({
      ...common,
      operation: async () => {
        thirdEntered = true;
      },
    });
    await Promise.resolve();
    expect(thirdEntered).toBe(false);

    secondGate.resolve();
    await second;
    await third;
    expect(thirdEntered).toBe(true);
  });
});

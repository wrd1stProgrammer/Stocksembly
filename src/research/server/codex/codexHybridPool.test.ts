import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexHybridPool } from "./codexHybridPool";

const defaults = {
  subscriptionAvailable: () => true,
  apiEnabled: () => true,
  subscriptionCapacity: 1,
  apiCapacity: 1,
  spillAfterMs: 30_000,
};

afterEach(() => vi.useRealTimers());

describe("Codex hybrid process pool", () => {
  it("uses Pro first and spills only after the waiting threshold, within each capacity", async () => {
    vi.useFakeTimers();
    const pool = createCodexHybridPool(defaults);
    const pro = await pool.acquire("a");
    expect(pro.backend).toBe("subscription");
    const apiPending = pool.acquire("b");
    const granted = vi.fn();
    void apiPending.then(granted);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(granted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const api = await apiPending;
    expect(api.backend).toBe("api");
    const thirdPending = pool.acquire("c");
    const thirdGranted = vi.fn();
    void thirdPending.then(thirdGranted);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(thirdGranted).not.toHaveBeenCalled();
    pro.release();
    const third = await thirdPending;
    expect(third.backend).toBe("subscription");
    pro.release();
    api.release();
    third.release();
  });

  it("immediately redirects queued work after auth loss without replacing active Pro calls", async () => {
    let available = true;
    const pool = createCodexHybridPool({
      ...defaults,
      subscriptionAvailable: () => available,
    });
    const running = await pool.acquire("a");
    const waiting = pool.acquire("b");
    available = false;
    pool.refresh();
    const api = await waiting;
    expect(running.backend).toBe("subscription");
    expect(api.backend).toBe("api");
    running.release();
    const nextPending = pool.acquire("c");
    api.release();
    const next = await nextPending;
    expect(next.backend).toBe("api");
    next.release();
    available = true;
    pool.refresh();
    const recovered = await pool.acquire("d");
    expect(recovered.backend).toBe("subscription");
    recovered.release();
  });

  it("removes aborted waiters and does not leak or double release capacity", async () => {
    const pool = createCodexHybridPool({
      ...defaults,
      apiEnabled: () => false,
    });
    const running = await pool.acquire("a");
    const controller = new AbortController();
    const aborted = pool.acquire("b", controller.signal);
    const rejection = expect(aborted).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    running.release();
    running.release();
    const next = await pool.acquire("c");
    expect(next.backend).toBe("subscription");
    next.release();
    await expect(pool.acquire("d", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("gives another run a turn ahead of a busy run's queued calls", async () => {
    const pool = createCodexHybridPool({
      ...defaults,
      subscriptionCapacity: 2,
      apiEnabled: () => false,
    });
    const first = await pool.acquire("a");
    const second = await pool.acquire("a");
    const aWaiting = pool.acquire("a");
    const bWaiting = pool.acquire("b");
    first.release();
    const b = await bWaiting;
    expect(b.backend).toBe("subscription");
    second.release();
    const a = await aWaiting;
    a.release();
    b.release();
  });

  it("surfaces Pro authentication through its caller when API is disabled", async () => {
    const pool = createCodexHybridPool({
      ...defaults,
      subscriptionAvailable: () => false,
      apiEnabled: () => false,
    });
    const lease = await pool.acquire("a");
    expect(lease.backend).toBe("subscription");
    lease.release();
  });
});

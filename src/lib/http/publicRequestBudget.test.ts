// @vitest-environment node
import { expect, it, vi } from "vitest";
import { publicRequestBudget } from "./publicRequestBudget";
import { shortCache } from "./shortCache";

it("limits a peer even when its caller-controlled forwarding prefix changes", () => {
  vi.useFakeTimers();
  try {
    const request = (prefix: string) =>
      new Request("https://stocksembly.com/api/test", {
        headers: { "x-forwarded-for": `${prefix}, 203.0.113.2` },
      });
    expect(
      publicRequestBudget(request("1.1.1.1"), "test-budget", 1),
    ).toBeUndefined();
    expect(
      publicRequestBudget(request("2.2.2.2"), "test-budget", 1)?.status,
    ).toBe(429);
    vi.advanceTimersByTime(60_001);
    expect(
      publicRequestBudget(request("2.2.2.2"), "test-budget", 1),
    ).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

it("shares concurrent loads and does not retain rejected work", async () => {
  const cached = shortCache<number>(10_000);
  const load = vi.fn(async () => 42);
  expect(await Promise.all([cached("a", load), cached("a", load)])).toEqual([
    42, 42,
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  await expect(
    cached("b", async () => {
      throw new Error("upstream");
    }),
  ).rejects.toThrow("upstream");
  expect(await cached("b", load)).toBe(42);
});

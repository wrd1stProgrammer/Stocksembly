// @vitest-environment node
import { expect, it, vi } from "vitest";
import { publicRequestBudget } from "./publicRequestBudget";
import { shortCache } from "./shortCache";

it("limits a peer even when its caller-controlled forwarding prefix changes", () => {
  vi.useFakeTimers();
  try {
    const request = (prefix: string) =>
      new Request("https://stocksembly.com/api/test", {
        headers: { "x-forwarded-for": `${prefix}, 203.0.113.2, 10.24.0.15` },
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

it("isolates clients behind the same ALB node", () => {
  const request = (client: string) =>
    new Request("https://stocksembly.com", {
      headers: { "x-forwarded-for": `${client}, 10.24.0.15` },
    });
  expect(
    publicRequestBudget(request("203.0.113.10"), "isolation", 1),
  ).toBeUndefined();
  expect(
    publicRequestBudget(request("203.0.113.11"), "isolation", 1),
  ).toBeUndefined();
  expect(
    publicRequestBudget(request("203.0.113.10"), "isolation", 1)?.status,
  ).toBe(429);
});

it("does not let rejected requests consume the shared route allowance", () => {
  const request = (ip: string) =>
    new Request("https://stocksembly.com", {
      headers: { "x-forwarded-for": `${ip}, 10.24.0.15` },
    });
  publicRequestBudget(request("203.0.113.20"), "rejected-budget", 1);
  for (let i = 0; i < 25; i++) {
    expect(
      publicRequestBudget(request("203.0.113.20"), "rejected-budget", 1)
        ?.status,
    ).toBe(429);
  }
  expect(
    publicRequestBudget(request("203.0.113.21"), "rejected-budget", 1),
  ).toBeUndefined();
});

it("supports a single trusted proxy without trusting a spoofed prefix", () => {
  vi.stubEnv("STOCKSEMBLY_TRUSTED_PROXY_HOPS", "1");
  try {
    const request = (prefix: string) =>
      new Request("https://stocksembly.com", {
        headers: { "x-forwarded-for": `${prefix}, 203.0.113.31` },
      });
    expect(
      publicRequestBudget(request("1.1.1.1"), "one-proxy", 1),
    ).toBeUndefined();
    expect(
      publicRequestBudget(request("2.2.2.2"), "one-proxy", 1)?.status,
    ).toBe(429);
  } finally {
    vi.unstubAllEnvs();
  }
});

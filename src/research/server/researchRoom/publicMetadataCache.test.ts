import { expect, it, vi } from "vitest";
import { createPublicMetadataCache } from "./publicMetadataCache";

it("coalesces concurrent reads, separates locales, and expires publication metadata", async () => {
  let now = 0;
  const load = vi.fn(async (locale: string) => ({ locale, version: now }));
  const cached = createPublicMetadataCache(load, 30_000, () => now);
  const values = await Promise.all([cached("ko"), cached("ko"), cached("en")]);
  expect(load).toHaveBeenCalledTimes(2);
  expect(values[0]).toBe(values[1]);
  expect(values[2]?.locale).toBe("en");
  now = 30_001;
  expect(await cached("ko")).toEqual({ locale: "ko", version: now });
  expect(load).toHaveBeenCalledTimes(3);
});

it("retries failures rather than caching an outage", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("database unavailable"))
    .mockResolvedValue("recovered");
  const cached = createPublicMetadataCache(load, 30_000);
  await expect(cached("ko")).rejects.toThrow("database unavailable");
  await expect(cached("ko")).resolves.toBe("recovered");
});

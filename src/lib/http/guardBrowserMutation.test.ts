import { afterEach, expect, it, vi } from "vitest";
import { guardBrowserMutation } from "./guardBrowserMutation";

afterEach(() => vi.unstubAllEnvs());
it("rejects absent/foreign origins before reading a mutation body", async () => {
  vi.stubEnv("STOCKSEMBLY_PUBLIC_ORIGIN", "https://stocksembly.com");
  for (const origin of ["https://evil.test", "null", ""]) {
    const response = await guardBrowserMutation(
      new Request("https://stocksembly.com/api/account/preferences", {
        method: "PUT",
        headers: origin ? { origin } : {},
      }),
    );
    expect(response?.status).toBe(403);
  }
});
it("allows same-origin bodyless changes and JSON with charset, bounds request size", async () => {
  vi.stubEnv("STOCKSEMBLY_PUBLIC_ORIGIN", "https://stocksembly.com");
  const make = (body?: string) =>
    new Request("https://stocksembly.com/api/account/preferences", {
      method: "PUT",
      headers: {
        origin: "https://stocksembly.com",
        "content-type": "application/json; charset=utf-8",
      },
      ...(body === undefined ? {} : { body }),
    });
  expect(await guardBrowserMutation(make())).toBeUndefined();
  expect(await guardBrowserMutation(make('{"locale":"ko"}'))).toBeUndefined();
  expect((await guardBrowserMutation(make("a".repeat(65_537))))?.status).toBe(
    413,
  );
});

import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("canonical host redirect", () => {
  it("redirects every www path to the apex domain with HTTP 301", async () => {
    const redirects = nextConfig.redirects;
    if (!redirects) throw new TypeError("Missing redirects configuration");

    await expect(redirects()).resolves.toContainEqual({
      source: "/:path*",
      has: [{ type: "host", value: "www.stocksembly.com" }],
      destination: "https://stocksembly.com/:path*",
      statusCode: 301,
    });
  });
});

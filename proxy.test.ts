import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const kyState = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("ky", () => ({ default: { get: kyState.get } }));

import { proxy } from "./proxy";

beforeEach(() => {
  kyState.get.mockReset();
  kyState.get.mockImplementation(
    async () =>
      new Response("<main><h1>Public source</h1></main>", {
        headers: { "Content-Type": "text/html" },
      }),
  );
});

describe("agent content-negotiation proxy", () => {
  it("serves a Markdown-preferred request without an internal HTTP rewrite", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/about?lang=en", {
        headers: { Accept: "text/markdown, text/html;q=0.8" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(await response.text()).toContain("# Public source");
    expect(kyState.get).toHaveBeenCalledWith(
      new URL("https://stocksembly.com/about?lang=en"),
      expect.any(Object),
    );
  });

  it("returns 406 when neither HTML nor Markdown is acceptable", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/", {
        headers: { Accept: "application/pdf" },
      }),
    );

    expect(response.status).toBe(406);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(await response.text()).toContain(
      "Available: text/html, text/markdown",
    );
  });

  it("leaves browser HTML requests in place and adds Vary", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/", {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Vary")).toContain("Accept");
  });

  it("forwards a supported path locale to the root layout", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/zh-TW/blog", {
        headers: { Accept: "text/html" },
      }),
    );

    expect(
      response.headers.get("x-middleware-request-x-stocksembly-route-locale"),
    ).toBe("zh-TW");
  });

  it("keeps the apex HTML language aligned with explicit home metadata", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/?lang=ko", {
        headers: { Accept: "text/html", "accept-language": "en-US" },
      }),
    );
    expect(
      response.headers.get("x-middleware-request-x-stocksembly-route-locale"),
    ).toBe("ko");
  });

  it("keeps path languages authoritative over query preferences", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/ja?lang=ko", {
        headers: { Accept: "text/html" },
      }),
    );
    expect(
      response.headers.get("x-middleware-request-x-stocksembly-route-locale"),
    ).toBe("ja");
  });
});

describe("Markdown behind a TLS-terminating proxy", () => {
  it.each(["https://localhost:4187", "https://127.0.0.1:4187"])(
    "fetches public HTML instead of rewriting to %s",
    async (origin) => {
      const response = await proxy(
        new NextRequest(`${origin}/ko/us-stock-analysis`, {
          headers: {
            Accept: "text/markdown",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "attacker.invalid",
            "x-stocksembly-markdown-source-origin": "http://169.254.169.254",
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      const body = await response.text();
      expect(body).toContain("https://stocksembly.com/ko/us-stock-analysis");
      expect(body).not.toContain("localhost");
      expect(body).not.toContain("4187");
      const [url, options] = kyState.get.mock.calls[0] ?? [];
      expect(url).toEqual(
        new URL("https://stocksembly.com/ko/us-stock-analysis"),
      );
      expect(options.headers.get("Accept")).toBe("text/html");
      expect(options.headers.get("x-stocksembly-markdown-source")).toBe("1");
      expect(options.headers.get("cookie")).toBeNull();
      expect(options.headers.get("x-forwarded-host")).toBeNull();
    },
  );

  it("leaves the internal HTML fetch in HTML representation", async () => {
    const response = await proxy(
      new NextRequest("https://stocksembly.com/ko/us-stock-analysis", {
        headers: { Accept: "text/html", "x-stocksembly-markdown-source": "1" },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(kyState.get).not.toHaveBeenCalled();
  });

  it("rejects unknown public origins without fetching", async () => {
    const response = await proxy(
      new NextRequest("https://attacker.invalid/about", {
        headers: { Accept: "text/markdown" },
      }),
    );
    expect(response.status).toBe(400);
    expect(kyState.get).not.toHaveBeenCalled();
  });
});

it("does not turn Markdown POSTs into source GET requests", async () => {
  const response = await proxy(
    new NextRequest("https://stocksembly.com/about", {
      method: "POST",
      headers: { Accept: "text/markdown" },
    }),
  );
  expect(response.status).toBe(405);
  expect(kyState.get).not.toHaveBeenCalled();
});

it("returns Markdown headers without a response body for HEAD", async () => {
  const response = await proxy(
    new NextRequest("https://stocksembly.com/about", {
      method: "HEAD",
      headers: { Accept: "text/markdown" },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/markdown");
  expect(await response.text()).toBe("");
});

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("agent content-negotiation proxy", () => {
  it("rewrites a Markdown-preferred request and varies the response", () => {
    const response = proxy(
      new NextRequest("https://stocksembly.com/about?lang=en", {
        headers: { Accept: "text/markdown, text/html;q=0.8" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://stocksembly.com/api/agent-markdown/about?lang=en",
    );
    expect(
      response.headers.get(
        "x-middleware-request-x-stocksembly-markdown-source-origin",
      ),
    ).toBe("https://stocksembly.com");
  });

  it("returns 406 when neither HTML nor Markdown is acceptable", async () => {
    const response = proxy(
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

  it("leaves browser HTML requests in place and adds Vary", () => {
    const response = proxy(
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

  it("forwards a supported path locale to the root layout", () => {
    const response = proxy(
      new NextRequest("https://stocksembly.com/zh-TW/blog", {
        headers: { Accept: "text/html" },
      }),
    );

    expect(
      response.headers.get("x-middleware-request-x-stocksembly-route-locale"),
    ).toBe("zh-TW");
  });
});

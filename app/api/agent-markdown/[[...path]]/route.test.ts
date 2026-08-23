import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORIGINAL_TARGET_HEADER } from "@/src/lib/agent/markdownHeaders";

const kyState = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("ky", () => ({ default: { get: kyState.get } }));

import { GET } from "./route";

beforeEach(() => {
  kyState.get.mockReset();
});

describe("agent Markdown route", () => {
  it("preserves a source 404 and returns a Markdown recovery document", async () => {
    kyState.get.mockResolvedValueOnce(
      new Response(
        '<html id="__next_error__"><head><title>Not found</title></head><body></body></html>',
        {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
    );

    const response = await GET(
      new Request("https://stocksembly.com/api/agent-markdown/missing", {
        headers: { [ORIGINAL_TARGET_HEADER]: "/missing" },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("Vary")).toContain("Accept");
    const body = await response.text();
    expect(body).toContain("# Page not found");
    expect(body).toContain(
      "[Public research](https://stocksembly.com/research-room)",
    );
    expect(body).toContain("[Sitemap](https://stocksembly.com/sitemap.xml)");
  });

  it("serves a successful HTML source as Markdown", async () => {
    kyState.get.mockResolvedValueOnce(
      new Response(
        "<html><head><title>Stocksembly</title></head><body><main><h1>Stocksembly</h1><p>Research US equities.</p></main></body></html>",
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
    );

    const response = await GET(
      new Request("https://stocksembly.com/api/agent-markdown", {
        headers: { [ORIGINAL_TARGET_HEADER]: "/" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("# Stocksembly");
  });
});

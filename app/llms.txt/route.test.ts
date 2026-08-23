import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("llms.txt", () => {
  it("follows the llms.txt order and gives concrete when-to-use guidance", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(body).toMatch(/^# Stocksembly\n\n> /);
    expect(body).toContain("## When to use Stocksembly");
    expect(body).toContain("## How to use Stocksembly");
    expect(body).toContain("https://stocksembly.com/research-room");
    expect(body).toContain("https://stocksembly.com/sitemap.xml");
  });
});

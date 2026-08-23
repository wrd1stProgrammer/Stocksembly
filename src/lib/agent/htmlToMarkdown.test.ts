import { describe, expect, it } from "vitest";
import { htmlToAgentMarkdown } from "./htmlToMarkdown";

describe("agent Markdown projection", () => {
  it("keeps semantic content and links while removing scripts and controls", () => {
    const markdown = htmlToAgentMarkdown(
      `<!doctype html>
      <html lang="en-US">
        <head><title>Stocksembly</title><script>secret()</script></head>
        <body>
          <nav><a href="/about">About</a></nav>
          <main>
            <h1>Research a stock</h1>
            <p>Compare the thesis with evidence.</p>
            <h2>Where to go next</h2>
            <ul><li><a href="/research-room">Public research</a></li></ul>
            <button>Do not include this control</button>
          </main>
        </body>
      </html>`,
      new URL("https://stocksembly.com/example"),
    );

    expect(markdown).toContain("# Research a stock");
    expect(markdown).toContain("## Where to go next");
    expect(markdown).toContain(
      "[Public research](https://stocksembly.com/research-room)",
    );
    expect(markdown).not.toContain("secret()");
    expect(markdown).not.toContain("Do not include this control");
    expect(markdown).toContain(
      "[Agent instructions](https://stocksembly.com/llms.txt)",
    );
  });

  it("turns a real 404 document into short recovery Markdown", () => {
    const markdown = htmlToAgentMarkdown(
      `<html><head><title>Not found</title></head><body><main>
        <h1>Page not found</h1>
        <p>The requested path does not exist.</p>
        <nav>
          <a href="/sitemap.xml">Sitemap</a>
          <a href="/llms.txt">Agent guide</a>
        </nav>
      </main></body></html>`,
      new URL("https://stocksembly.com/missing"),
    );

    expect(markdown).toContain("# Page not found");
    expect(markdown).toContain(
      "[Sitemap](https://stocksembly.com/sitemap.xml)",
    );
    expect(markdown).toContain(
      "[Agent guide](https://stocksembly.com/llms.txt)",
    );
  });
});

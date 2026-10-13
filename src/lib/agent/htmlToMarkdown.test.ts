import { describe, expect, it } from "vitest";
import { AgentHtmlError, htmlToAgentMarkdown } from "./htmlToMarkdown";

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

const canonicalUrl = new URL("https://stocksembly.com/research-room?lang=en");

describe("React streaming HTML", () => {
  it("restores a segment through its placeholder before replacing a nested fallback", () => {
    const markdown = htmlToAgentMarkdown(
      `
      <body><!--$?--><template id="B:0"></template>
        <main aria-busy="true">Loading outer</main>
        <!--$?--><template id="B:2"></template>Loading inner<!--/$-->
        <!--/$-->
      <div hidden id="S:0"><template id="P:1"></template></div>
      <div hidden id="S:1"><main><h1>Public research</h1><h2>FAQ</h2>
        <p>Evidence <a href="/about">Source</a></p>
        <!--$?--><template id="B:3"></template>Loading detail<!--/$-->
        <p hidden>Private control</p><div aria-hidden="true">Decorative</div>
      </main></div>
      <div hidden id="S:3"><p>Completed detail</p></div>
      <div hidden id="S:9"><main>Unreferenced hidden content</main></div>
      <script>$RS("S:1","P:1");$RC("B:0","S:0");$RC("B:3","S:3")</script>
      </body>`,
      canonicalUrl,
    );
    expect(markdown).toContain("# Public research");
    expect(markdown).toContain("## FAQ");
    expect(markdown).toContain("[Source](https://stocksembly.com/about)");
    expect(markdown).toContain("Completed detail");
    for (const text of [
      "Loading",
      "Private control",
      "Decorative",
      "Unreferenced",
    ])
      expect(markdown).not.toContain(text);
  });

  it.each([
    '<!--$?--><template id="B:0"></template><main>Loading</main><!--/$--><div hidden id="S:0"><main>Not committed</main></div>',
    '<!--$?--><template id="B:0"></template><main>Loading</main><!--/$--><script>$RC("B:0","S:0")</script>',
    '<!--$?--><template id="B:0"></template><main>Loading</main><div hidden id="S:0"><main>Missing boundary close</main></div><script>$RC("B:0","S:0")</script>',
    '<main aria-busy="true">Loading</main>',
  ])("rejects an incomplete stream", (html) => {
    expect(() => htmlToAgentMarkdown(html, canonicalUrl)).toThrow(
      AgentHtmlError,
    );
  });

  it("does not interpret instruction text in Flight data or normal prose", () => {
    expect(() =>
      htmlToAgentMarkdown(
        `
      <!--$?--><template id="B:0"></template><main>Loading</main><!--/$-->
      <div hidden id="S:0"><main>Not completed</main></div>
      <script>self.__next_f.push([1,'$RC("B:0","S:0")'])</script>
    `,
        canonicalUrl,
      ),
    ).toThrow(AgentHtmlError);
  });

  it("allows intentional noindex login content", () => {
    const markdown = htmlToAgentMarkdown(
      '<meta name="robots" content="noindex"><main><h1>Sign in</h1><p>Log in to continue.</p></main>',
      canonicalUrl,
    );
    expect(markdown).toContain("# Sign in");
  });

  it.each([
    '<script>;;$RX("B:1","NEXT_HTTP_ERROR_FALLBACK;404")</script>',
    '<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template>',
  ])("distinguishes framework 404 from noindex", (html) => {
    expect(() => htmlToAgentMarkdown(html, canonicalUrl)).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("rejects framework errors without leaking the digest", () => {
    expect(() =>
      htmlToAgentMarkdown(
        '<script>$RX("B:0","private-digest")</script>',
        canonicalUrl,
      ),
    ).toThrow(expect.objectContaining({ status: 502 }));
  });
});

describe("React style-dependent streaming boundaries", () => {
  it("restores RR content and nested segments without loading styles or exposing hidden UI", () => {
    const markdown = htmlToAgentMarkdown(
      `
      <body><!--$?--><template id="B:0"></template><main aria-busy="true">Loading styles</main><!--/$-->
      <div hidden id="S:0"><main><h1>Styled research</h1>
        <!--$?--><template id="B:1"></template>Loading evidence<!--/$-->
        <div hidden>Private account control</div>
      </main></div>
      <div hidden id="S:1"><p>Published evidence <a href="/about">Source</a></p></div>
      <div hidden id="S:9"><main>Unrelated hidden document</main></div>
      <script>$RR("B:0","S:0",[["/_next/static/main.css","default","media","screen"],["/_next/static/other.css","default"]]);$RC("B:1","S:1")</script></body>
    `,
      canonicalUrl,
    );
    expect(markdown).toContain("# Styled research");
    expect(markdown).toContain("Published evidence");
    expect(markdown).toContain("[Source](https://stocksembly.com/about)");
    for (const text of [
      "Loading",
      "Private account",
      "Unrelated",
      ".css",
      "$RR",
    ])
      expect(markdown).not.toContain(text);
  });

  it.each(["[[runCode()]]", '["not a style tuple"]', "[[42]]"])(
    "rejects nonliteral style dependencies %s",
    (dependencies) => {
      expect(() =>
        htmlToAgentMarkdown(
          `
      <body><!--$?--><template id="B:0"></template><main>Loading</main><!--/$-->
      <div hidden id="S:0"><main>Incomplete</main></div>
      <script>$RR("B:0","S:0",${dependencies})</script></body>
    `,
          canonicalUrl,
        ),
      ).toThrow(AgentHtmlError);
    },
  );
});

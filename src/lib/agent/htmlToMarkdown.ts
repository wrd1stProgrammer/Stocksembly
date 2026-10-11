import { type CheerioAPI, load } from "cheerio";

const REMOVED_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "button",
  "input",
  "textarea",
  "select",
  "dialog",
].join(",");

export class AgentHtmlError extends Error {
  constructor(readonly status: number) {
    super("The HTML representation is incomplete or unavailable.");
  }
}

// Interpret only React's emitted segment instructions; never evaluate scripts.
const restoreStreamedContent = ($: CheerioAPI): void => {
  const scripts = $("script:not([src])").toArray();
  for (const script of scripts) {
    const source = $(script).text();
    const failure = /(?:^|;)\s*\$RX\("B:[^"\\]+","([^"\\]*)"/u.exec(source);
    if (failure) {
      const status = /^NEXT_HTTP_ERROR_FALLBACK;(401|403|404)$/u.exec(
        failure[1] ?? "",
      );
      throw new AgentHtmlError(status ? Number(status[1]) : 502);
    }
    for (const match of source.matchAll(
      /(?:^|;)\s*\$(RS|RC|RR)\("([BPS]:[a-zA-Z0-9]+)","([PS]:[a-zA-Z0-9]+)"(?:,(\[[\s\S]*?\]))?\)(?=;|$)/gu,
    )) {
      const [, operation, first, second, styles] = match;
      if (operation === "RR") {
        // $RR waits for CSS then calls $RC. Text projection needs no CSS fetch.
        // Validate the emitted string arrays as JSON, never as JavaScript.
        if (styles === undefined) continue;
        let dependencies: unknown;
        try {
          dependencies = JSON.parse(styles);
        } catch {
          continue;
        }
        if (
          !Array.isArray(dependencies) ||
          !dependencies.every(
            (dependency: unknown) =>
              Array.isArray(dependency) &&
              dependency.every((value: unknown) => typeof value === "string"),
          )
        )
          continue;
      } else if (styles !== undefined) continue;
      const segmentId = operation === "RS" ? first : second;
      const targetId = operation === "RS" ? second : first;
      const segment = $(`div[hidden][id="${segmentId}"]`).first();
      const target = $(`template[id="${targetId}"]`).first();
      if (!segment.length || !target.length) continue;
      if (operation === "RS") {
        target.replaceWith(segment.contents());
        segment.remove();
        continue;
      }
      const boundary = target[0]?.prev;
      if (boundary?.type !== "comment" || boundary.data !== "$?") continue;
      // Locate the matching close, including nested Suspense boundaries.
      let cursor = target[0]?.next;
      let depth = 0;
      while (cursor) {
        if (cursor.type === "comment") {
          if (cursor.data === "/$" || cursor.data === "/&") {
            if (depth === 0) break;
            depth -= 1;
          } else if (["$", "$?", "$~", "$!", "&"].includes(cursor.data)) {
            depth += 1;
          }
        }
        cursor = cursor.next;
      }
      if (!cursor) continue;
      let fallback = target[0]?.next;
      while (fallback && fallback !== cursor) {
        const next = fallback.next;
        $(fallback).remove();
        fallback = next;
      }
      target.replaceWith(segment.contents());
      segment.remove();
      boundary.data = "$";
    }
  }
  const digest = $("template[data-dgst]").first().attr("data-dgst");
  if (digest !== undefined) {
    const status = /^NEXT_HTTP_ERROR_FALLBACK;(401|403|404)$/u.exec(digest);
    throw new AgentHtmlError(status ? Number(status[1]) : 502);
  }
  if ($("html#__next_error__").length) throw new AgentHtmlError(502);
  $("[hidden], [aria-hidden='true']").remove();
  if (
    $('template[id^="B:"], template[id^="P:"], main[aria-busy="true"]').length
  )
    throw new AgentHtmlError(502);
};

function absoluteHref(href: string, canonicalUrl: URL): string {
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  if (!URL.canParse(href, canonicalUrl)) return href;
  return new URL(href, canonicalUrl).toString();
}

function compactMarkdown(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToAgentMarkdown(html: string, canonicalUrl: URL): string {
  const $ = load(html);
  restoreStreamedContent($);
  $(REMOVED_ELEMENTS).remove();
  $("[hidden], [aria-hidden='true']").remove();
  $("br").replaceWith("\n");

  $("a[href]").each((_index, element) => {
    const link = $(element);
    const label = link.text().replace(/\s+/g, " ").trim();
    const href = link.attr("href");
    const blockLink = link.parent().is("nav, address");
    const markdownLink =
      href === undefined || label.length === 0
        ? label
        : `[${label}](${absoluteHref(href, canonicalUrl)})`;
    link.replaceWith(blockLink ? `\n${markdownLink}\n` : markdownLink);
  });

  $("li").each((_index, element) => {
    const item = $(element);
    item.replaceWith(`\n- ${item.text().trim()}\n`);
  });
  $("blockquote").each((_index, element) => {
    const quote = $(element);
    quote.replaceWith(`\n> ${quote.text().trim()}\n`);
  });
  for (let level = 1; level <= 6; level += 1) {
    $(`h${String(level)}`).each((_index, element) => {
      const heading = $(element);
      heading.replaceWith(`\n${"#".repeat(level)} ${heading.text().trim()}\n`);
    });
  }
  $("p, dt, dd, figcaption").each((_index, element) => {
    const paragraph = $(element);
    paragraph.replaceWith(`\n${paragraph.text().trim()}\n`);
  });

  const main = $("main").first();
  const article = $("article").first();
  const primary =
    main.length > 0
      ? main.text()
      : article.length > 0
        ? article.text()
        : $("body").text();
  const footer = $("footer").first();
  const footerText =
    main.length > 0 && footer.length > 0 && !main.find("footer").length
      ? footer.text()
      : "";
  const title = $("title").first().text().trim();
  let body = compactMarkdown(`${primary}\n${footerText}`);
  if (!/^#\s/m.test(body) && title.length > 0) body = `# ${title}\n\n${body}`;

  const resourceLinks = [
    `[Canonical URL](${canonicalUrl.toString()})`,
    `[Agent instructions](${canonicalUrl.origin}/llms.txt)`,
    `[Sitemap](${canonicalUrl.origin}/sitemap.xml)`,
  ].join(" · ");
  return `${body}\n\n---\n${resourceLinks}\n`;
}

export function agentNotFoundMarkdown(canonicalUrl: URL): string {
  return `# Page not found

The requested path does not exist on Stocksembly. Use one of these public resources to recover:

- [Home](${canonicalUrl.origin}/)
- [Public research](${canonicalUrl.origin}/research-room?lang=en)
- [Agent instructions](${canonicalUrl.origin}/llms.txt)
- [Contact](${canonicalUrl.origin}/contact)
- [Sitemap](${canonicalUrl.origin}/sitemap.xml)

Requested URL: ${canonicalUrl.toString()}
`;
}

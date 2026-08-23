import { load } from "cheerio";

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
- [Public research](${canonicalUrl.origin}/research-room)
- [Agent instructions](${canonicalUrl.origin}/llms.txt)
- [Contact](${canonicalUrl.origin}/contact)
- [Sitemap](${canonicalUrl.origin}/sitemap.xml)

Requested URL: ${canonicalUrl.toString()}
`;
}

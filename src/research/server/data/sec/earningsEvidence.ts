import { load } from "cheerio";
import type { FilingMetadata } from "./filingsPayload";

export function selectCurrentReports(
  records: readonly FilingMetadata[],
): readonly FilingMetadata[] {
  const recent = records
    .filter((record) => record.form === "8-K")
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  const earnings = recent.find((record) =>
    /(?:^|,)\s*2\.02\s*(?:,|$)/u.test(record.items ?? ""),
  );
  return [
    ...new Map(
      [
        ...(earnings === undefined ? [] : [earnings]),
        ...recent.slice(0, 2),
      ].map((record) => [record.accessionNumber, record]),
    ).values(),
  ];
}

export function earningsExhibitDocuments(
  html: string,
  sourceUrl: string,
): readonly string[] {
  const base = new URL(sourceUrl);
  const directory = base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
  if (
    base.origin !== "https://www.sec.gov" ||
    !directory.startsWith("/Archives/edgar/data/")
  )
    return [];
  const $ = load(html);
  const documents = new Set<string>();
  for (const anchor of $("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (href === undefined || href.startsWith("#")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    const name = url.pathname.slice(directory.length);
    const context = `${$(anchor).text()} ${$(anchor).closest("tr").text()} ${name}`;
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(directory) ||
      url.pathname === base.pathname ||
      url.search ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html?$/iu.test(name) ||
      !/99[._-]?1|99[._-]?2|earnings|results|shareholder|press.release|financial.release|exhibit\s*99/iu.test(
        context,
      )
    )
      continue;
    documents.add(name);
    if (documents.size === 2) break;
  }
  return [...documents];
}

import { load } from "cheerio";

export type CoverPageInput = {
  readonly form: string;
  readonly tradingSymbol: string;
  readonly cik: string;
  readonly securityExchangeName: string;
  readonly security12bTitle: string;
};

type CoverFacts = {
  tradingSymbol?: string;
  securityExchangeName?: string;
  security12bTitle?: string;
};

export function extractCoverPages(
  bytes: Uint8Array,
  cik: string,
  form: string,
): readonly CoverPageInput[] | undefined {
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
  if (!/<(?:html|body)\b/i.test(html)) return undefined;
  const document = load(html);
  const contexts = new Map<string, CoverFacts>();
  document("[name]").each((_index, element) => {
    const fact = document(element);
    const name = fact.attr("name")?.toLowerCase();
    const context = fact.attr("contextref") ?? fact.attr("contextRef");
    if (name === undefined || context === undefined) return;
    const value = fact.text().replace(/\s+/g, " ").trim();
    if (value.length === 0) return;
    const facts = contexts.get(context) ?? {};
    if (name.endsWith(":tradingsymbol")) facts.tradingSymbol = value;
    if (name.endsWith(":securityexchangename"))
      facts.securityExchangeName = value;
    if (name.endsWith(":security12btitle")) facts.security12bTitle = value;
    contexts.set(context, facts);
  });
  const covers: CoverPageInput[] = [];
  for (const facts of contexts.values()) {
    if (
      facts.tradingSymbol === undefined ||
      facts.securityExchangeName === undefined ||
      facts.security12bTitle === undefined
    )
      continue;
    covers.push(
      Object.freeze({
        form,
        tradingSymbol: facts.tradingSymbol,
        cik,
        securityExchangeName: facts.securityExchangeName,
        security12bTitle: facts.security12bTitle,
      }),
    );
  }
  return covers.length === 0 ? undefined : Object.freeze(covers);
}

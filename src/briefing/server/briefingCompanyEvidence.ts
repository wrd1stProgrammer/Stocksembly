const SYMBOL_EVIDENCE_TERMS = {
  AAPL: ["Services", "iPhone", "product mix", "supply"],
  NVDA: ["Blackwell", "data center", "networking", "supply"],
  TSLA: ["deliveries", "automotive gross margin", "energy storage"],
  MSFT: ["Azure", "intelligent cloud", "capex", "cloud"],
  AMZN: ["AWS", "advertising", "fulfillment", "cloud"],
  JPM: [
    "CET1",
    "ROTCE",
    "net charge-offs",
    "net interest income",
    "NII",
    "credit costs",
    "provision",
  ],
} as const;

const GENERIC_EVIDENCE_TERMS = [
  "operating margin",
  "gross margin",
  "capex",
] as const;

const COMPANY_EVIDENCE_TERMS = [
  "Services",
  "iPhone",
  "product mix",
  "supply",
  "Blackwell",
  "data center",
  "networking",
  "deliveries",
  "automotive gross margin",
  "energy storage",
  "Azure",
  "intelligent cloud",
  "capex",
  "cloud",
  "AWS",
  "advertising",
  "fulfillment",
  "CET1",
  "ROTCE",
  "net charge-offs",
  "net interest income",
  "NII",
  "credit costs",
  "provision",
  "operating margin",
  "gross margin",
] as const;

export type CompanyEvidenceTerm = (typeof COMPANY_EVIDENCE_TERMS)[number];

type EvidenceMatch = {
  readonly term: CompanyEvidenceTerm;
  readonly index: number;
  readonly end: number;
};

function escaped(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function exactMatch(
  text: string,
  term: CompanyEvidenceTerm,
): EvidenceMatch | undefined {
  const match = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${escaped(term)})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).exec(text);
  if (match === null) return undefined;
  const matchedTerm = match[1];
  if (matchedTerm === undefined) return undefined;
  const index = match.index + match[0].indexOf(matchedTerm);
  return { term, index, end: index + matchedTerm.length };
}

function evidenceTermsForSymbol(
  symbol: string,
): readonly CompanyEvidenceTerm[] {
  const normalized = symbol.toUpperCase().split(":").at(-1) ?? symbol;
  const specific = (() => {
    switch (normalized) {
      case "AAPL":
        return SYMBOL_EVIDENCE_TERMS.AAPL;
      case "NVDA":
        return SYMBOL_EVIDENCE_TERMS.NVDA;
      case "TSLA":
        return SYMBOL_EVIDENCE_TERMS.TSLA;
      case "MSFT":
        return SYMBOL_EVIDENCE_TERMS.MSFT;
      case "AMZN":
        return SYMBOL_EVIDENCE_TERMS.AMZN;
      case "JPM":
        return SYMBOL_EVIDENCE_TERMS.JPM;
      default:
        return [];
    }
  })();
  return [...specific, ...GENERIC_EVIDENCE_TERMS];
}

export function companyEvidenceTerms(
  text: string,
  symbol: string,
  limit = 2,
): readonly CompanyEvidenceTerm[] {
  const selected: EvidenceMatch[] = [];
  for (const term of evidenceTermsForSymbol(symbol)) {
    const match = exactMatch(text, term);
    if (
      match === undefined ||
      selected.some(
        (candidate) =>
          match.index < candidate.end && match.end > candidate.index,
      )
    ) {
      continue;
    }
    selected.push(match);
    if (selected.length === limit) break;
  }
  return Object.freeze(selected.map((match) => match.term));
}

export function companyEvidenceExcerpt(
  content: string,
  symbol: string,
  limit: number,
): string {
  const normalized = content.replaceAll(/\s+/gu, " ").trim();
  const focus = evidenceTermsForSymbol(symbol).flatMap((term) => {
    const match = exactMatch(normalized, term);
    return match === undefined ? [] : [match];
  })[0];
  if (focus === undefined || focus.index < limit)
    return normalized.slice(0, limit);

  const header = normalized.slice(0, 96).trim();
  const separator = " … ";
  const windowLength = limit - header.length - separator.length;
  const windowStart = Math.max(0, focus.index - Math.floor(windowLength / 3));
  const window = normalized
    .slice(windowStart, windowStart + windowLength)
    .trim();
  return `${header}${separator}${window}`.slice(0, limit);
}

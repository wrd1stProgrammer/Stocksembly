import {
  assertNever,
  type Cik,
  type IssuerId,
  issuerIdFor,
  type SecurityClassId,
  type SecurityId,
  securityClassIdFor,
  securityIdFor,
  type TickerSymbol,
} from "./ids";
import {
  DOMESTIC_FORMS,
  EXCHANGE_ALIASES,
  FPI_FORMS,
  IdentityInputSchema,
  INVESTMENT_FORMS,
  REQUIRED_DOMESTIC_FORMS,
} from "./securityIdentity.schema";

export { isSupportedSecurityIdentity } from "./securityIdentity.membership";

export const SUPPORTED_EXCHANGES = ["NASDAQ", "NYSE", "NYSE_AMERICAN"] as const;
export type SupportedExchange = (typeof SUPPORTED_EXCHANGES)[number];
export const IDENTITY_SOURCES = [
  "sec_ticker_exchange",
  "sec_submissions",
  "sec_10k_cover_page",
] as const;
export type IdentitySource = (typeof IDENTITY_SOURCES)[number];

export type SupportedSecurityIdentity = {
  readonly securityId: SecurityId;
  readonly issuerId: IssuerId;
  readonly securityClassId: SecurityClassId;
  readonly ticker: TickerSymbol;
  readonly cik: Cik;
  readonly exchange: SupportedExchange;
  readonly title: string;
  readonly securityClass: "common_stock";
  readonly filingForms: readonly string[];
  readonly identitySources: readonly IdentitySource[];
};

export type SecurityIdentityAdmission =
  | { readonly kind: "admitted"; readonly identity: SupportedSecurityIdentity }
  | { readonly kind: "ambiguous"; readonly reason: AmbiguousSecurityReason }
  | { readonly kind: "unsupported"; readonly reason: UnsupportedSecurityReason }
  | { readonly kind: "invalid_input"; readonly reason: "malformed_input" };

type AmbiguousSecurityReason =
  | "ambiguous_ticker"
  | "ambiguous_security_class"
  | "source_disagreement";

export type UnsupportedSecurityReason =
  | SecurityClassReason
  | "foreign_private_issuer"
  | "otc"
  | "unsupported_exchange"
  | "unsupported_form"
  | "insufficient_filing"
  | "missing_cover_triplet"
  | "ticker_not_found"
  | "untrusted_input";

function normalizeExchange(
  value: string,
): SupportedExchange | "OTC" | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === "OTC" || normalized.startsWith("OTC ")) return "OTC";
  return EXCHANGE_ALIASES.get(normalized);
}

type SecurityClassReason =
  | "adr"
  | "etf"
  | "fund"
  | "unit"
  | "warrant"
  | "preferred"
  | "debt"
  | "unknown_security_class";
type SecurityClassResult =
  | { readonly kind: "common_stock" }
  | { readonly kind: "unsupported"; readonly reason: SecurityClassReason };

const UNSUPPORTED_TITLE_PATTERNS: readonly [RegExp, SecurityClassReason][] = [
  [/\b(adr|depositary|american depositary)\b/, "adr"],
  [/\b(etf|exchange traded fund)\b/, "etf"],
  [/\b(fund|beneficial interest|trust)\b/, "fund"],
  [/\b(unit|units)\b/, "unit"],
  [/\bwarrant(s)?\b/, "warrant"],
  [/\b(preferred|preference)\b/, "preferred"],
  [/\b(debt|note|notes|bond|debenture)\b/, "debt"],
];

function classifySecurityClass(title: string): SecurityClassResult {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const unsupportedPattern = UNSUPPORTED_TITLE_PATTERNS.find(([pattern]) =>
    pattern.test(normalized),
  );
  if (unsupportedPattern !== undefined) {
    return { kind: "unsupported", reason: unsupportedPattern[1] };
  }
  if (/\bcommon (stock|shares)\b/.test(normalized))
    return { kind: "common_stock" };
  return { kind: "unsupported", reason: "unknown_security_class" };
}

function uniqueByIdentity<T>(
  values: readonly T[],
  key: (value: T) => string,
): readonly T[] {
  return values.filter(
    (value, index) =>
      values.findIndex((candidate) => key(candidate) === key(value)) === index,
  );
}

const hasDomesticForm = (forms: readonly string[], base: string): boolean =>
  forms.some((form) => form === base || form === `${base}/A`);

export function validateSecurityIdentityInput(
  input: unknown,
): SecurityIdentityAdmission {
  const parsed = IdentityInputSchema.safeParse(input);
  if (!parsed.success)
    return { kind: "invalid_input", reason: "malformed_input" };

  const { submittedSymbol, tickerExchangeRows, filingForms, coverPages } =
    parsed.data;
  const matchingRows = tickerExchangeRows.filter(
    (row) => row.symbol === submittedSymbol,
  );
  if (matchingRows.length === 0)
    return { kind: "unsupported", reason: "ticker_not_found" };

  const uniqueRows = uniqueByIdentity(
    matchingRows,
    (row) => `${row.cik}:${row.exchange.trim().toUpperCase()}`,
  );
  if (uniqueRows.length !== 1)
    return { kind: "ambiguous", reason: "ambiguous_ticker" };
  const row = uniqueRows[0];
  if (row === undefined)
    return { kind: "invalid_input", reason: "malformed_input" };

  if (filingForms.some((source) => source.cik !== row.cik)) {
    return { kind: "ambiguous", reason: "source_disagreement" };
  }
  if (coverPages.some((cover) => cover.cik !== row.cik)) {
    return { kind: "ambiguous", reason: "source_disagreement" };
  }
  const forms = filingForms.map((source) => source.form.trim().toUpperCase());
  if (forms.some((form) => FPI_FORMS.has(form))) {
    return { kind: "unsupported", reason: "foreign_private_issuer" };
  }
  if (forms.some((form) => INVESTMENT_FORMS.has(form))) {
    return { kind: "unsupported", reason: "fund" };
  }
  if (!REQUIRED_DOMESTIC_FORMS.every((form) => hasDomesticForm(forms, form))) {
    return { kind: "unsupported", reason: "insufficient_filing" };
  }

  const recentCovers = coverPages.filter(
    (cover) =>
      cover.tradingSymbol === submittedSymbol &&
      ["10-K", "10-K/A"].includes(cover.form.trim().toUpperCase()),
  );
  if (recentCovers.length === 0) {
    return { kind: "unsupported", reason: "missing_cover_triplet" };
  }
  if (recentCovers.some((cover) => cover.cik !== row.cik)) {
    return { kind: "ambiguous", reason: "source_disagreement" };
  }
  const uniqueCovers = uniqueByIdentity(
    recentCovers,
    (cover) =>
      `${cover.tradingSymbol}:${cover.securityExchangeName.trim().toUpperCase()}:${cover.security12bTitle.toLowerCase()}`,
  );
  if (uniqueCovers.length !== 1) {
    return { kind: "ambiguous", reason: "ambiguous_security_class" };
  }
  const cover = uniqueCovers[0];
  if (cover === undefined)
    return { kind: "invalid_input", reason: "malformed_input" };

  const rowExchange = normalizeExchange(row.exchange);
  const coverExchange = normalizeExchange(cover.securityExchangeName);
  if (rowExchange === "OTC" || coverExchange === "OTC") {
    return { kind: "unsupported", reason: "otc" };
  }
  if (rowExchange === undefined || coverExchange === undefined) {
    return { kind: "unsupported", reason: "unsupported_exchange" };
  }
  if (rowExchange !== coverExchange) {
    return { kind: "ambiguous", reason: "source_disagreement" };
  }
  if (row.cik !== cover.cik) {
    return { kind: "ambiguous", reason: "source_disagreement" };
  }

  const securityClass = classifySecurityClass(cover.security12bTitle);
  switch (securityClass.kind) {
    case "unsupported":
      return { kind: "unsupported", reason: securityClass.reason };
    case "common_stock":
      break;
    default:
      return assertNever(securityClass);
  }
  const acceptedForms = forms.filter((form) => DOMESTIC_FORMS.has(form));
  return {
    kind: "admitted",
    identity: {
      securityId: securityIdFor(row.cik, submittedSymbol, rowExchange),
      issuerId: issuerIdFor(row.cik),
      securityClassId: securityClassIdFor(
        submittedSymbol,
        cover.security12bTitle,
      ),
      ticker: submittedSymbol,
      cik: row.cik,
      exchange: rowExchange,
      title: cover.security12bTitle,
      securityClass: securityClass.kind,
      filingForms: acceptedForms,
      identitySources: IDENTITY_SOURCES,
    },
  };
}

export function resolveSecurityIdentity(
  input: unknown,
): SecurityIdentityAdmission {
  const result = validateSecurityIdentityInput(input);
  return result.kind === "admitted"
    ? { kind: "unsupported", reason: "untrusted_input" }
    : result;
}

import Decimal from "decimal.js";

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const DECIMAL_COMPONENTS = /^-?(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export const COMPANY_FACT_DECIMAL_LIMITS = {
  maxLexemeLength: 128,
  maxSignificantDigits: 80,
  maxSourceExponent: 120,
  minAdjustedExponent: -40,
  maxAdjustedExponent: 40,
} as const;

const PreciseDecimal = Decimal.clone({ precision: 80 });

export class CompanyFactsJsonError extends Error {
  constructor() {
    super("malformed Company Facts JSON number");
    this.name = "CompanyFactsJsonError";
  }
}

function stringEnd(source: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return index + 1;
  }
  throw new CompanyFactsJsonError();
}

function afterWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  return index;
}

function isValKey(source: string, start: number, end: number): boolean {
  try {
    return JSON.parse(source.slice(start, end)) === "val";
  } catch (error) {
    if (error instanceof SyntaxError) throw new CompanyFactsJsonError();
    throw error;
  }
}

function numberEnd(source: string, start: number): number {
  const match = JSON_NUMBER.exec(source.slice(start));
  if (match === null) throw new CompanyFactsJsonError();
  const end = start + match[0].length;
  const delimiter = source[afterWhitespace(source, end)];
  if (delimiter !== "," && delimiter !== "}") throw new CompanyFactsJsonError();
  return end;
}

export function preserveCompanyFactNumberLexemes(source: string): string {
  const parts: string[] = [];
  let copiedThrough = 0;
  let index = 0;
  while (index < source.length) {
    if (source[index] !== '"') {
      index += 1;
      continue;
    }
    const end = stringEnd(source, index);
    if (!isValKey(source, index, end)) {
      index = end;
      continue;
    }
    const colon = afterWhitespace(source, end);
    if (source[colon] !== ":") {
      index = end;
      continue;
    }
    const valueStart = afterWhitespace(source, colon + 1);
    const first = source[valueStart];
    if (first !== "-" && (first === undefined || first < "0" || first > "9")) {
      index = end;
      continue;
    }
    const valueEnd = numberEnd(source, valueStart);
    const lexeme = source.slice(valueStart, valueEnd);
    parts.push(source.slice(copiedThrough, valueStart), JSON.stringify(lexeme));
    copiedThrough = valueEnd;
    index = valueEnd;
  }
  parts.push(source.slice(copiedThrough));
  return parts.join("");
}

export function normalizeCompanyFactDecimal(
  lexeme: string,
): string | undefined {
  if (lexeme.length > COMPANY_FACT_DECIMAL_LIMITS.maxLexemeLength)
    return undefined;
  const components = DECIMAL_COMPONENTS.exec(lexeme);
  const integer = components?.[1];
  if (integer === undefined) return undefined;
  const fraction = components?.[2] ?? "";
  const significantDigits = `${integer}${fraction}`.replace(/^0+/, "");
  if (
    (significantDigits.length || 1) >
    COMPANY_FACT_DECIMAL_LIMITS.maxSignificantDigits
  )
    return undefined;
  const sourceExponent = Number(components?.[3] ?? "0");
  if (
    !Number.isSafeInteger(sourceExponent) ||
    Math.abs(sourceExponent) > COMPANY_FACT_DECIMAL_LIMITS.maxSourceExponent
  )
    return undefined;
  const decimal = new PreciseDecimal(lexeme);
  if (
    !decimal.isFinite() ||
    decimal.e < COMPANY_FACT_DECIMAL_LIMITS.minAdjustedExponent ||
    decimal.e > COMPANY_FACT_DECIMAL_LIMITS.maxAdjustedExponent
  )
    return undefined;
  return decimal.toString();
}

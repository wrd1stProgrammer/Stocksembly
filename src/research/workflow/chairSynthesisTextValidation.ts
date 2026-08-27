import {
  normalizeEditorialText,
  textSimilarity,
} from "../domain/editorialQuality";

type PublicText = { readonly en: string; readonly ko: string };
type SourceText = { readonly text: PublicText };

const NUMERIC_TOKEN =
  /[$€£]?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|[A-Za-z]+)?/gu;

type NumericValue = {
  readonly canonical: string;
  readonly value: number;
  readonly decimalPlaces: number;
};

function numericValue(token: string): NumericValue | undefined {
  const match = token.replaceAll(",", "").match(/\d+(?:\.(\d+))?/u);
  if (match === null) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value)
    ? {
        canonical: String(value),
        value,
        decimalPlaces: match[1]?.length ?? 0,
      }
    : undefined;
}

function isGroundedNumber(
  summary: NumericValue,
  sources: readonly NumericValue[],
): boolean {
  if (sources.some((source) => source.canonical === summary.canonical))
    return true;
  const scale = 10 ** summary.decimalPlaces;
  return sources.some(
    (source) =>
      source.decimalPlaces > summary.decimalPlaces &&
      Math.round((source.value + Number.EPSILON) * scale) / scale ===
        summary.value,
  );
}

function hasOnlyGroundedNumbers(
  summary: string,
  sources: readonly string[],
): boolean {
  const groundedValues = (sources.join(" ").match(NUMERIC_TOKEN) ?? [])
    .map(numericValue)
    .filter((value): value is NumericValue => value !== undefined);
  return (summary.match(NUMERIC_TOKEN) ?? []).every((token) => {
    const value = numericValue(token);
    return value !== undefined && isGroundedNumber(value, groundedValues);
  });
}

function hasHumanReadablePrecision(summary: string): boolean {
  return (summary.match(NUMERIC_TOKEN) ?? []).every((token) => {
    const value = numericValue(token);
    return value === undefined || value.decimalPlaces <= 2;
  });
}

function sharesGroundingLanguage(
  summary: string,
  sources: readonly string[],
): boolean {
  const sourceTokens = new Set(
    sources
      .join(" ")
      .toLocaleLowerCase("und")
      .match(/[\p{L}\p{N}_-]{2,}/gu) ?? [],
  );
  const summaryTokens =
    summary.toLocaleLowerCase("und").match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  return summaryTokens.some((token) => sourceTokens.has(token));
}

export function publicTextIsValid(
  text: PublicText,
  sentences: readonly SourceText[],
  maxLength: number,
  expectedLocale?: "en" | "ko",
): boolean {
  const singleLocale = text.en.trim() === text.ko.trim();
  const english = sentences.map((sentence) => sentence.text.en);
  const korean = sentences.map((sentence) => sentence.text.ko);
  const bilingualNumbers = [...english, ...korean];
  if (singleLocale) {
    if (expectedLocale === undefined) return false;
    if (
      (expectedLocale === "en" &&
        (!/\p{Script=Latin}/u.test(text.en) ||
          /\p{Script=Hangul}/u.test(text.en))) ||
      (expectedLocale === "ko" && !/\p{Script=Hangul}/u.test(text.ko))
    )
      return false;
    const source = [...english, ...korean];
    return (
      text.en.length <= maxLength &&
      sharesGroundingLanguage(text.en, source) &&
      hasHumanReadablePrecision(text.en) &&
      hasOnlyGroundedNumbers(text.en, bilingualNumbers)
    );
  }
  if (!/\p{Script=Latin}/u.test(text.en) || !/\p{Script=Hangul}/u.test(text.ko))
    return false;
  if (text.en.length > maxLength || text.ko.length > maxLength) return false;
  // The authenticated bilingual source can express the same monetary value
  // with different units (for example $215.9B vs US$2159억). A translated
  // summary may preserve either representation, so numeric grounding uses the
  // union while language grounding remains locale-specific.
  return (
    sharesGroundingLanguage(text.en, english) &&
    sharesGroundingLanguage(text.ko, korean) &&
    hasHumanReadablePrecision(text.en) &&
    hasHumanReadablePrecision(text.ko) &&
    hasOnlyGroundedNumbers(text.en, bilingualNumbers) &&
    hasOnlyGroundedNumbers(text.ko, bilingualNumbers)
  );
}

export function decisionTextsAreDistinct(
  texts: readonly PublicText[],
): boolean {
  for (let left = 0; left < texts.length; left += 1)
    for (let right = left + 1; right < texts.length; right += 1) {
      const first = texts[left];
      const second = texts[right];
      if (first === undefined || second === undefined) return false;
      if (
        textSimilarity(first.en, second.en, "en").duplicate ||
        textSimilarity(first.ko, second.ko, "ko").duplicate
      )
        return false;
    }
  return true;
}

export function isSymmetricHedge(text: PublicText): boolean {
  const en = normalizeEditorialText(text.en);
  const ko = normalizeEditorialText(text.ko);
  const pairedEn =
    /\b(?:upside|reward|opportunity)s?\b.*\b(?:downside|risk)s?\b|\b(?:downside|risk)s?\b.*\b(?:upside|reward|opportunity)s?\b/u.test(
      en,
    );
  const balancedEn =
    /\b(?:equal|equally|balanced|same|symmetric|symmetrical)\b/u.test(en);
  const pairedKo =
    /(?:상방|상승|기회).*(?:하방|하락|위험)|(?:하방|하락|위험).*(?:상방|상승|기회)/u.test(
      ko,
    );
  const balancedKo = /(?:동일|같(?:다|은|이|게)?|균형|대등|비슷)/u.test(ko);
  return (
    /\b(?:could|may)\s+(?:rise|increase).{0,48}\b(?:could|may)\s+(?:fall|decline)\b/iu.test(
      text.en,
    ) ||
    /(?:오를|상승할)\s*수도.{0,36}(?:내릴|하락할)\s*수도/u.test(text.ko) ||
    (pairedEn && balancedEn) ||
    (pairedKo && balancedKo)
  );
}

import {
  normalizeEditorialText,
  textSimilarity,
} from "../domain/editorialQuality";

type PublicText = { readonly en: string; readonly ko: string };
type SourceText = { readonly text: PublicText };

const NUMERIC_TOKEN =
  /[$€£]?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|[A-Za-z]+)?/gu;

function numericValue(token: string): string | undefined {
  const match = token.replaceAll(",", "").match(/\d+(?:\.\d+)?/u);
  if (match === null) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? String(value) : undefined;
}

function hasOnlyGroundedNumbers(
  summary: string,
  sources: readonly string[],
): boolean {
  const groundedValues = new Set(
    (sources.join(" ").match(NUMERIC_TOKEN) ?? [])
      .map(numericValue)
      .filter((value): value is string => value !== undefined),
  );
  return (summary.match(NUMERIC_TOKEN) ?? []).every((token) => {
    const value = numericValue(token);
    return value !== undefined && groundedValues.has(value);
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
): boolean {
  const normalizedEn = normalizeEditorialText(text.en).replace(/\s/gu, "");
  const normalizedKo = normalizeEditorialText(text.ko).replace(/\s/gu, "");
  if (normalizedEn === normalizedKo) return false;
  if (!/\p{Script=Latin}/u.test(text.en) || !/\p{Script=Hangul}/u.test(text.ko))
    return false;
  if (text.en.length > maxLength || text.ko.length > maxLength) return false;
  if (/\b(?:buy|sell)\s+now\b/iu.test(text.en)) return false;
  if (/(?:지금|즉시)\s*(?:매수|매도)/u.test(text.ko)) return false;
  const english = sentences.map((sentence) => sentence.text.en);
  const korean = sentences.map((sentence) => sentence.text.ko);
  // The authenticated bilingual source can express the same monetary value
  // with different units (for example $215.9B vs US$2159억). A translated
  // summary may preserve either representation, so numeric grounding uses the
  // union while language grounding remains locale-specific.
  const bilingualNumbers = [...english, ...korean];
  return (
    sharesGroundingLanguage(text.en, english) &&
    sharesGroundingLanguage(text.ko, korean) &&
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

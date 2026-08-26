export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;

const STOCKSEMBLY_SUFFIX = " · Stocksembly";

function truncateSeoText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  let clipped = normalized.slice(0, maxLength - 1).trimEnd();
  const finalCodeUnit = clipped.charCodeAt(clipped.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff)
    clipped = clipped.slice(0, -1);

  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.7))
    clipped = clipped.slice(0, lastSpace);

  return `${clipped.trimEnd()}…`;
}

export function boundedSeoTitle(value: string): string {
  return truncateSeoText(value, SEO_TITLE_MAX_LENGTH);
}

export function brandedSeoTitle(value: string): string {
  const base = truncateSeoText(
    value,
    SEO_TITLE_MAX_LENGTH - STOCKSEMBLY_SUFFIX.length,
  );
  return `${base}${STOCKSEMBLY_SUFFIX}`;
}

export function boundedSeoDescription(value: string): string {
  return truncateSeoText(value, SEO_DESCRIPTION_MAX_LENGTH);
}

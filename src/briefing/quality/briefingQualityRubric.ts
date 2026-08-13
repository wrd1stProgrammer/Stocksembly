export const BRIEFING_QUALITY_SYMBOLS = [
  "AAPL",
  "NVDA",
  "TSLA",
  "MSFT",
  "AMZN",
  "JPM",
] as const;

export const BRIEFING_QUALITY_DIMENSIONS = {
  dataArithmetic: {
    label: "Data and arithmetic integrity",
    maximum: 2,
  },
  noveltySourceQuality: {
    label: "Novelty and source quality",
    maximum: 2,
  },
  timingBranches: {
    label: "Actionable timing and branches",
    maximum: 2,
  },
  companySectorSpecificity: {
    label: "Company and sector specificity",
    maximum: 1.5,
  },
  proseNonSlop: {
    label: "Prose and non-slop",
    maximum: 1.5,
  },
  stateContractHonesty: {
    label: "State and contract honesty",
    maximum: 1,
  },
} as const;

export const BRIEFING_QUALITY_TOTAL_MAXIMUM = 10;
export const BRIEFING_QUALITY_SYMBOL_MINIMUM = 8;
export const BRIEFING_QUALITY_MEAN_MINIMUM = 8.3;

export type BriefingQualitySymbol = (typeof BRIEFING_QUALITY_SYMBOLS)[number];
export type BriefingQualityDimension = keyof typeof BRIEFING_QUALITY_DIMENSIONS;

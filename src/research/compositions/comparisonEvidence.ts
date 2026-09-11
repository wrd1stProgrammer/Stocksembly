import type {
  InsightSentryBarSet,
  InsightSentryMarket,
} from "../server/data/insightsentry/insightSentryMarket";
import type { PeersDataset } from "../server/data/insightsentry/insightSentryResearchContracts";

/** Match observed sessions, excluding today's potentially unfinished daily bar. */
export function matchedPriceReturns(
  subject: InsightSentryBarSet,
  comparator: InsightSentryBarSet,
  asOf: string,
) {
  const cutoff = asOf.slice(0, 10);
  const prices = (set: InsightSentryBarSet) =>
    new Map(
      set.bars
        .filter((bar) => bar.timestamp.slice(0, 10) < cutoff && bar.close > 0)
        .map((bar) => [bar.timestamp.slice(0, 10), bar.close] as const),
    );
  const left = prices(subject),
    right = prices(comparator);
  const dates = [...left.keys()].filter((date) => right.has(date)).sort();
  const end = dates.at(-1);
  if (!end || Date.parse(cutoff) - Date.parse(end) > 7 * 86400000) return [];
  return [20, 60, 250].flatMap((sessions) => {
    const start = dates.at(-1 - sessions);
    if (!start) return [];
    const subjectReturn = (left.get(end)! / left.get(start)! - 1) * 100;
    const comparatorReturn = (right.get(end)! / right.get(start)! - 1) * 100;
    const round = (value: number) => Math.round(value * 100) / 100;
    return [
      {
        sessions,
        start,
        end,
        subjectReturnPercent: round(subjectReturn),
        comparatorReturnPercent: round(comparatorReturn),
        excessPercentagePoints: round(subjectReturn - comparatorReturn),
      },
    ];
  });
}

export async function collectComparisonEvidence(input: {
  market: InsightSentryMarket;
  subject?: InsightSentryBarSet | undefined;
  peers?: PeersDataset | undefined;
  symbol: string;
  asOf: string;
  question: string;
  sectorText: string;
}) {
  const semiconductor = /semiconductor|반도체/iu.test(input.sectorText);
  const technology = /technology|software|기술|소프트웨어/iu.test(
    input.sectorText,
  );
  const proxy = semiconductor
    ? "NASDAQ:SOXX"
    : technology
      ? "AMEX:XLK"
      : undefined;
  const peers = input.peers?.peers.slice(0, 4) ?? [];
  const targets = [
    ...(proxy ? [{ symbol: proxy, kind: "sector_etf_proxy" }] : []),
    ...peers
      .slice(0, 3)
      .map((peer) => ({ symbol: peer.symbol, kind: peer.classification })),
  ];
  const comparisons =
    input.subject === undefined
      ? []
      : await Promise.all(
          targets.map(async (target) => {
            try {
              const bars = await input.market.comparisonDailyBars(
                target.symbol,
              );
              return {
                ...target,
                windows: matchedPriceReturns(input.subject!, bars, input.asOf),
              };
            } catch {
              return {
                ...target,
                windows: [],
                limitation: "comparison_history_unavailable",
              };
            }
          }),
        );
  return {
    symbol: input.symbol,
    asOf: input.asOf,
    methodology:
      "Matched daily regular-session closes, split adjusted, dividends unadjusted. 20/60/250 common sessions are observed lookbacks, not forecasts. ETF is an industry/sector proxy, not a competitor or total-return index. Compare each row only within its dated window.",
    comparisons,
    subject: input.peers?.subject,
    operatingPeers: peers.map(
      ({
        symbol,
        name,
        classification,
        marketOverlapVerified,
        revenueGrowthTtm,
        grossMarginTtm,
        operatingMarginTtm,
        priceEarningsTtm,
      }) => ({
        symbol,
        name,
        classification,
        marketOverlapVerified,
        revenueGrowthTtm,
        grossMarginTtm,
        operatingMarginTtm,
        priceEarningsTtm,
      }),
    ),
    limitation:
      "Consolidated peer metrics do not establish product-level share, adoption or segment economics. Missing values must remain unknown. Valuation eligibility is separate from business competition.",
  };
}

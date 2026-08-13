import type {
  BriefingSignal,
  BriefingSourceSnapshot,
  BriefingWatchlistItem,
} from "../domain/contracts";
import { createBriefingCollectorClients } from "./briefingCollectorClients";
import { mapBriefingFinancials } from "./briefingCollectorFinancials";
import { mapBriefingMarket } from "./briefingCollectorMarket";
import { mapBriefingNews } from "./briefingCollectorNews";

export type BriefingDataCollector = {
  readonly collect: (input: {
    readonly item: BriefingWatchlistItem;
    readonly marketDate: string;
    readonly cutoffAt: string;
    readonly previousEventKeys: readonly string[];
    readonly previousBriefingAt?: string;
  }) => Promise<BriefingSourceSnapshot>;
};

function coverageStart(cutoffAt: string, previousBriefingAt?: string): string {
  const cutoff = Date.parse(cutoffAt);
  const previous =
    previousBriefingAt === undefined
      ? Number.NaN
      : Date.parse(previousBriefingAt);
  const elapsed = cutoff - previous;
  if (
    Number.isFinite(previous) &&
    previous < cutoff &&
    elapsed <= 5 * 24 * 60 * 60 * 1_000
  ) {
    return new Date(previous).toISOString();
  }
  return new Date(cutoff - 24 * 60 * 60 * 1_000).toISOString();
}

function uniqueSignals(
  values: readonly BriefingSignal[],
): readonly BriefingSignal[] {
  const seen = new Set<string>();
  return values.filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

export function createBriefingDataCollector(input: {
  readonly dataRoot: string;
}): BriefingDataCollector {
  const clients = createBriefingCollectorClients(input);
  return {
    async collect({
      item,
      marketDate,
      cutoffAt,
      previousEventKeys,
      previousBriefingAt,
    }) {
      const startAt = coverageStart(cutoffAt, previousBriefingAt);
      const responses = await clients.collect({
        item,
        cutoffAt,
        startAt,
        previousEventKeys,
      });
      const market = mapBriefingMarket({
        responses,
        item,
        marketDate,
        cutoffAt,
      });
      const news = mapBriefingNews({
        result: responses.news,
        item,
        startAt,
        cutoffAt,
      });
      const financials = mapBriefingFinancials({
        responses,
        item,
        startAt,
        cutoffAt,
      });
      const editorial = uniqueSignals([
        ...news.signals,
        ...financials.documentSignals,
      ]);
      const price = market.priceSignals.slice(0, 1);
      const signals = Object.freeze([
        ...editorial.slice(0, 6 - price.length),
        ...price,
      ]);
      const limitations = [
        ...market.limitations,
        ...(responses.companyInfo.status === "fulfilled"
          ? []
          : ["company_info"]),
        ...(news.limited ? ["news"] : []),
        ...financials.limitations.filter(
          (limitation) => limitation !== "company_info",
        ),
      ];
      return Object.freeze({
        symbol: item.symbol,
        company: item.company,
        providerCode: item.providerCode,
        marketDate,
        cutoffAt,
        coverageStart: startAt,
        quote: market.quote,
        signals: Object.freeze(signals),
        upcomingEvents: Object.freeze(financials.upcomingEvents),
        fundamentals: financials.fundamentals,
        fundamentalSeries: financials.fundamentalSeries,
        ...(market.marketReference === undefined
          ? {}
          : { marketReference: market.marketReference }),
        ...(market.technicalReference === undefined
          ? {}
          : { technicalReference: market.technicalReference }),
        ...(financials.earnings === undefined
          ? {}
          : { earnings: financials.earnings }),
        ...(financials.backgroundFinancialContext === undefined
          ? {}
          : {
              backgroundFinancialContext: financials.backgroundFinancialContext,
            }),
        sources: Object.freeze(news.sources),
        limitations: Object.freeze([...new Set(limitations)]),
      });
    },
  };
}

import type {
  NewsDataset,
  NewsEventCard,
} from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import type {
  BriefingSignal,
  BriefingSource,
  BriefingWatchlistItem,
} from "../domain/contracts";
import { isAdmissibleBriefingNewsTitle } from "./briefingCollectionPolicy";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";

const LOCAL_FLOW_TERMS =
  /(?:korea|korean|south korea|한국|국내).{0,80}(?:retail|investor|fund|etf|leverag|net buy|net sell|flow|position|개인|투자자|펀드|레버리지|순매수|순매도|수급)|(?:retail|investor|fund|etf|leverag|net buy|net sell|flow|position|개인|투자자|펀드|레버리지|순매수|순매도|수급).{0,80}(?:korea|korean|south korea|한국|국내)/iu;
const OPERATING_LINK_TERMS =
  /revenue|sales|shipment|order|contract|factory|production|pricing|selling price|product price|margin|approval|license|partnership|launch|delivery|매출|판매|출하|수주|계약|공장|생산|제품 가격|판매 가격|마진|승인|라이선스|파트너십|출시|인도/iu;
const COMPANY_SUFFIXES = new Set([
  "corp",
  "corporation",
  "company",
  "inc",
  "incorporated",
  "limited",
  "ltd",
  "plc",
]);

function cleanNewsText(value: string): string {
  return value
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replaceAll(/[*_#>`]/gu, "")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function titleTerms(value: string): ReadonlySet<string> {
  return new Set(
    cleanNewsText(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3),
  );
}

function titleSimilarity(left: string, right: string): number {
  const a = titleTerms(left);
  const b = titleTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function referencesTrackedCompany(
  item: BriefingWatchlistItem,
  title: string,
  detail: string,
): boolean {
  const haystack = `${title} ${detail}`.toLowerCase();
  const tickerPattern = new RegExp(
    `(^|[^a-z0-9])${item.symbol.toLowerCase().replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^a-z0-9]|$)`,
    "u",
  );
  if (tickerPattern.test(haystack)) return true;
  return item.company
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 4 && !COMPANY_SUFFIXES.has(term))
    .some((term) =>
      new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "u").test(haystack),
    );
}

function uniqueNewsEvents(
  values: readonly NewsEventCard[],
): readonly NewsEventCard[] {
  const selected: NewsEventCard[] = [];
  for (const value of values) {
    if (
      selected.some(
        (candidate) => titleSimilarity(candidate.title, value.title) >= 0.62,
      )
    )
      continue;
    selected.push(value);
  }
  return selected;
}

function meaningFor(
  category: BriefingSignal["kind"],
  direction: BriefingSignal["direction"],
): string {
  if (category === "risk")
    return "This can change the downside distribution before it changes reported earnings.";
  if (category === "market")
    return "Read it through relative demand and the valuation multiple, not as a company-only signal.";
  if (direction === "positive")
    return "The signal matters only if it lifts the next revenue, margin, or cash-flow checkpoint.";
  if (direction === "negative")
    return "The signal raises the burden on the next operating result and guidance update.";
  return "The investment impact depends on whether the next filing confirms a measurable operating change.";
}

function dataFrom(
  result: BriefingCollectorResponses["news"],
): NewsDataset | undefined {
  return result.status === "fulfilled" && result.value.status === "available"
    ? result.value.data
    : undefined;
}

export function mapBriefingNews(input: {
  readonly result: BriefingCollectorResponses["news"];
  readonly item: BriefingWatchlistItem;
  readonly startAt: string;
  readonly cutoffAt: string;
}): {
  readonly signals: readonly BriefingSignal[];
  readonly sources: readonly BriefingSource[];
  readonly limited: boolean;
} {
  const data = dataFrom(input.result);
  const events = uniqueNewsEvents(
    (data?.events ?? []).filter((event) => {
      const detail =
        data?.excerpts.find((excerpt) => excerpt.eventKey === event.eventKey)
          ?.content ?? event.title;
      const text = `${event.title} ${detail}`;
      const issuerRelevant =
        !LOCAL_FLOW_TERMS.test(text) || OPERATING_LINK_TERMS.test(text);
      return (
        Date.parse(event.publishedAt) >= Date.parse(input.startAt) &&
        Date.parse(event.publishedAt) <= Date.parse(input.cutoffAt) &&
        referencesTrackedCompany(input.item, event.title, detail) &&
        issuerRelevant &&
        isAdmissibleBriefingNewsTitle(event.title)
      );
    }),
  );
  const signals = events.slice(0, 5).map((event) => {
    const excerpt =
      data?.excerpts.find((candidate) => candidate.eventKey === event.eventKey)
        ?.content ?? event.title;
    return {
      id: event.eventKey,
      kind: event.category,
      direction: event.direction,
      title: cleanNewsText(event.title),
      detail: cleanNewsText(excerpt).slice(0, 520),
      investmentMeaning: meaningFor(event.category, event.direction),
      occurredAt: event.publishedAt,
      ...(event.link === undefined ? {} : { sourceUrl: event.link }),
    };
  });
  const seen = new Set<string>();
  const sources = events.flatMap((event) => {
    if (event.link === undefined || seen.has(event.link)) return [];
    seen.add(event.link);
    return [
      {
        title: event.title,
        publisher: event.source ?? new URL(event.link).hostname,
        publishedAt: event.publishedAt,
        url: event.link,
      },
    ];
  });
  return { signals, sources, limited: data === undefined };
}

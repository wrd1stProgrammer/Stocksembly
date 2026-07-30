import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { InsightSentryClient } from "./insightSentryClient";
import type { PeerScreen } from "./insightSentryResearchContracts";

const DAY = 24 * 60 * 60 * 1_000;
const SCREENER_TTL = DAY;
const SELECTION_TTL = 30 * DAY;
const SELECTOR_VERSION = "peer-selector-v3";
const MAX_SCREENER_PAGES = 20;
const MIN_PEERS = 4;
const DEFAULT_PEERS = 8;

const ScreenerRowSchema = z
  .object({
    symbol_code: z.string().min(1),
    name: z.string().min(1),
    sector: z.string().min(1).nullish(),
    market_cap: z.number().finite().positive().nullish(),
    price_earnings_ttm: z.number().finite().nullish(),
    enterprise_value_ebitda_ttm: z.number().finite().nullish(),
    enterprise_value_to_revenue_ttm: z.number().finite().nullish(),
    total_revenue_yoy_growth_ttm: z.number().finite().nullish(),
    gross_margin_ttm: z.number().finite().nullish(),
    operating_margin_ttm: z.number().finite().nullish(),
    performance_3_month_market_cap: z.number().finite().nullish(),
    performance_year_market_cap: z.number().finite().nullish(),
  })
  .passthrough();

const ScreenerResponseSchema = z
  .object({
    hasNext: z.boolean().optional(),
    has_next: z.boolean().optional(),
    current_page: z.number().int().positive().optional(),
    total_page: z.number().int().positive(),
    current_items: z.number().int().nonnegative(),
    data: z.array(ScreenerRowSchema).max(1_000),
  })
  .passthrough();

type ScreenerRow = z.infer<typeof ScreenerRowSchema>;
type PeerClassification = "direct_competitor" | "operating_comparable";

const SelectionCacheSchema = z.strictObject({
  key: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  selected: z
    .array(
      z.strictObject({
        symbol: z.string().min(1),
        classification: z.enum(["direct_competitor", "operating_comparable"]),
      }),
    )
    .min(MIN_PEERS)
    .max(10),
});

type SelectionCache = z.infer<typeof SelectionCacheSchema>;

const SCREENER_FIELDS = [
  "market_cap",
  "sector",
  "price_earnings_ttm",
  "enterprise_value_ebitda_ttm",
  "enterprise_value_to_revenue_ttm",
  "total_revenue_yoy_growth_ttm",
  "gross_margin_ttm",
  "operating_margin_ttm",
  "performance_3_month_market_cap",
  "performance_year_market_cap",
] as const;

function screenerRequest(page: number, asOf: string) {
  return {
    endpoint: "stock_screener",
    pathSegments: ["screeners", "stock"],
    parameters: {},
    method: "POST" as const,
    requestBody: {
      fields: SCREENER_FIELDS,
      exchanges: ["NASDAQ", "NYSE", "AMEX"],
      countries: ["US"],
      page,
      sortBy: "market_cap",
      sortOrder: "desc",
      ignore_invalid: false,
    },
    asOfBucket: asOf.slice(0, 10),
    cacheTtlMilliseconds: SCREENER_TTL,
    schema: ScreenerResponseSchema,
  };
}

function cachePath(dataRoot: string, key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return join(dataRoot, "insightsentry", "peer-selections", `${digest}.json`);
}

async function readSelection(
  dataRoot: string,
  key: string,
  now: number,
): Promise<SelectionCache | undefined> {
  try {
    const decoded: unknown = JSON.parse(
      await readFile(cachePath(dataRoot, key), "utf8"),
    );
    const parsed = SelectionCacheSchema.safeParse(decoded);
    return parsed.success &&
      parsed.data.key === key &&
      Date.parse(parsed.data.expiresAt) > now
      ? parsed.data
      : undefined;
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    )
      return undefined;
    throw error;
  }
}

async function writeSelection(
  dataRoot: string,
  selection: SelectionCache,
): Promise<void> {
  const target = cachePath(dataRoot, selection.key);
  const directory = join(dataRoot, "insightsentry", "peer-selections");
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${JSON.stringify(selection)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function tickerFromCode(value: string): string {
  const separator = value.indexOf(":");
  return (separator < 0 ? value : value.slice(separator + 1)).toUpperCase();
}

function companyIdentity(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /\b(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings?|group|class [a-z]|ordinary shares?|common stock|depositary shares?)\b/gu,
      " ",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function dedupeUniverse(rows: readonly ScreenerRow[]): readonly ScreenerRow[] {
  const selected = new Map<string, ScreenerRow>();
  for (const row of rows) {
    const identity = companyIdentity(row.name) || row.symbol_code;
    const current = selected.get(identity);
    if (
      current === undefined ||
      (row.market_cap ?? 0) > (current.market_cap ?? 0)
    )
      selected.set(identity, row);
  }
  return [...selected.values()];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function numericSimilarity(
  left: number | null | undefined,
  right: number | null | undefined,
  scale: number,
): number | undefined {
  if (left == null || right == null) return undefined;
  return clamp(1 - Math.abs(left - right) / scale);
}

function financialSimilarity(
  target: ScreenerRow,
  candidate: ScreenerRow,
): number {
  const values = [
    numericSimilarity(
      target.total_revenue_yoy_growth_ttm,
      candidate.total_revenue_yoy_growth_ttm,
      120,
    ),
    numericSimilarity(target.gross_margin_ttm, candidate.gross_margin_ttm, 60),
    numericSimilarity(
      target.operating_margin_ttm,
      candidate.operating_margin_ttm,
      60,
    ),
  ].filter((value): value is number => value !== undefined);
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sizeSimilarity(target: ScreenerRow, candidate: ScreenerRow): number {
  if (target.market_cap == null || candidate.market_cap == null) return 0;
  const ratio = candidate.market_cap / target.market_cap;
  if (ratio <= 0) return 0;
  return clamp(1 - Math.abs(Math.log10(ratio)) / 1.5);
}

function mentionScore(
  normalizedAnnualText: string,
  candidate: ScreenerRow,
): { readonly score: number; readonly competitive: boolean } {
  const ticker = tickerFromCode(candidate.symbol_code).toLowerCase();
  const identity = companyIdentity(candidate.name);
  const aliases = [
    ...(identity.length >= 4 ? [identity] : []),
    ...(ticker.length >= 3 ? [ticker] : []),
  ];
  let mentioned = false;
  let competitive = false;
  for (const alias of aliases) {
    let position = normalizedAnnualText.indexOf(alias);
    while (position >= 0) {
      const before = normalizedAnnualText[position - 1] ?? " ";
      const after = normalizedAnnualText[position + alias.length] ?? " ";
      if (
        alias === ticker &&
        (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after))
      ) {
        position = normalizedAnnualText.indexOf(alias, position + alias.length);
        continue;
      }
      mentioned = true;
      const priorBoundaries = [
        normalizedAnnualText.lastIndexOf(".", position),
        normalizedAnnualText.lastIndexOf("!", position),
        normalizedAnnualText.lastIndexOf("?", position),
        normalizedAnnualText.lastIndexOf("\n", position),
      ];
      const nextBoundaries = [".", "!", "?", "\n"]
        .map((boundary) =>
          normalizedAnnualText.indexOf(boundary, position + alias.length),
        )
        .filter((boundary) => boundary >= 0);
      const sentenceStart = Math.max(...priorBoundaries) + 1;
      const sentenceEnd =
        nextBoundaries.length === 0
          ? normalizedAnnualText.length
          : Math.min(...nextBoundaries);
      const window = normalizedAnnualText.slice(sentenceStart, sentenceEnd);
      if (
        /\b(?:compet|rival|alternative|versus|market share|substitute)\w*/u.test(
          window,
        )
      ) {
        competitive = true;
        break;
      }
      position = normalizedAnnualText.indexOf(alias, position + alias.length);
    }
    if (competitive) break;
  }
  return {
    competitive,
    score: competitive ? 1 : mentioned ? 0.45 : 0,
  };
}

function scoredCandidate(
  target: ScreenerRow,
  candidate: ScreenerRow,
  normalizedAnnualText: string,
) {
  const mention = mentionScore(normalizedAnnualText, candidate);
  const financial = financialSimilarity(target, candidate);
  const size = sizeSimilarity(target, candidate);
  const completeness = [
    candidate.price_earnings_ttm,
    candidate.enterprise_value_ebitda_ttm,
    candidate.enterprise_value_to_revenue_ttm,
    candidate.total_revenue_yoy_growth_ttm,
    candidate.gross_margin_ttm,
    candidate.operating_margin_ttm,
  ].filter((value) => typeof value === "number").length;
  const score = clamp(
    mention.score * 0.48 +
      financial * 0.27 +
      size * 0.15 +
      (completeness / 6) * 0.1,
  );
  const classification: PeerClassification = mention.competitive
    ? "direct_competitor"
    : "operating_comparable";
  const reasons = [
    ...(mention.competitive
      ? ["issuer filing names the company near competition language"]
      : mention.score > 0
        ? ["issuer filing references the company"]
        : []),
    "same provider sector",
    ...(financial >= 0.62 ? ["similar growth and margin profile"] : []),
    ...(size >= 0.55 ? ["comparable market-cap scale"] : []),
  ].slice(0, 4);
  return { candidate, classification, reasons, score };
}

function selectPeers(input: {
  readonly target: ScreenerRow;
  readonly universe: readonly ScreenerRow[];
  readonly normalizedAnnualText: string;
  readonly limit: number;
}) {
  const scored = dedupeUniverse(input.universe)
    .filter(
      (candidate) =>
        candidate.symbol_code !== input.target.symbol_code &&
        candidate.sector != null &&
        candidate.sector === input.target.sector &&
        candidate.market_cap != null,
    )
    .map((candidate) =>
      scoredCandidate(input.target, candidate, input.normalizedAnnualText),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.candidate.market_cap ?? 0) - (left.candidate.market_cap ?? 0) ||
        left.candidate.symbol_code.localeCompare(right.candidate.symbol_code),
    );
  const direct = scored
    .filter((item) => item.classification === "direct_competitor")
    .slice(0, 3);
  const selectedSymbols = new Set(
    direct.map((item) => item.candidate.symbol_code),
  );
  const operating = scored
    .filter((item) => !selectedSymbols.has(item.candidate.symbol_code))
    .slice(0, Math.max(0, input.limit - direct.length));
  return [...direct, ...operating].slice(0, input.limit);
}

async function collectUniverse(
  client: InsightSentryClient,
  asOf: string,
): Promise<{
  readonly rows: readonly ScreenerRow[];
  readonly retrievedAt: string;
}> {
  const first = await client.get(screenerRequest(1, asOf));
  const totalPages = Math.min(
    MAX_SCREENER_PAGES,
    Math.max(1, first.data.total_page),
  );
  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      client.get(screenerRequest(index + 2, asOf)),
    ),
  );
  const responses = [first, ...remaining];
  return {
    rows: responses.flatMap((response) => response.data.data),
    retrievedAt:
      responses
        .map((response) => response.retrievedAt)
        .sort()
        .at(-1) ?? asOf,
  };
}

function toPeerRecord(
  scored: ReturnType<typeof scoredCandidate>,
  classification = scored.classification,
) {
  const row = scored.candidate;
  return Object.freeze({
    symbol: row.symbol_code,
    name: row.name,
    sector: row.sector ?? "Unknown",
    classification,
    selectionScore: Number(scored.score.toFixed(4)),
    selectionReasons:
      scored.reasons.length > 0
        ? scored.reasons
        : ["same provider sector", "available relative-value metrics"],
    ...(row.market_cap == null ? {} : { marketCap: row.market_cap }),
    ...(row.price_earnings_ttm == null
      ? {}
      : { priceEarningsTtm: row.price_earnings_ttm }),
    ...(row.enterprise_value_ebitda_ttm == null
      ? {}
      : { enterpriseValueEbitdaTtm: row.enterprise_value_ebitda_ttm }),
    ...(row.enterprise_value_to_revenue_ttm == null
      ? {}
      : {
          enterpriseValueRevenueTtm: row.enterprise_value_to_revenue_ttm,
        }),
    ...(row.total_revenue_yoy_growth_ttm == null
      ? {}
      : { revenueGrowthTtm: row.total_revenue_yoy_growth_ttm }),
    ...(row.gross_margin_ttm == null
      ? {}
      : { grossMarginTtm: row.gross_margin_ttm }),
    ...(row.operating_margin_ttm == null
      ? {}
      : { operatingMarginTtm: row.operating_margin_ttm }),
    ...(row.performance_3_month_market_cap == null
      ? {}
      : { performance3Month: row.performance_3_month_market_cap }),
    ...(row.performance_year_market_cap == null
      ? {}
      : { performance1Year: row.performance_year_market_cap }),
  });
}

function toSubjectMetrics(row: ScreenerRow) {
  return Object.freeze({
    symbol: row.symbol_code,
    name: row.name,
    sector: row.sector ?? "Unknown",
    ...(row.market_cap == null ? {} : { marketCap: row.market_cap }),
    ...(row.price_earnings_ttm == null
      ? {}
      : { priceEarningsTtm: row.price_earnings_ttm }),
    ...(row.enterprise_value_ebitda_ttm == null
      ? {}
      : { enterpriseValueEbitdaTtm: row.enterprise_value_ebitda_ttm }),
    ...(row.enterprise_value_to_revenue_ttm == null
      ? {}
      : {
          enterpriseValueRevenueTtm: row.enterprise_value_to_revenue_ttm,
        }),
    ...(row.total_revenue_yoy_growth_ttm == null
      ? {}
      : { revenueGrowthTtm: row.total_revenue_yoy_growth_ttm }),
    ...(row.gross_margin_ttm == null
      ? {}
      : { grossMarginTtm: row.gross_margin_ttm }),
    ...(row.operating_margin_ttm == null
      ? {}
      : { operatingMarginTtm: row.operating_margin_ttm }),
    ...(row.performance_3_month_market_cap == null
      ? {}
      : { performance3Month: row.performance_3_month_market_cap }),
    ...(row.performance_year_market_cap == null
      ? {}
      : { performance1Year: row.performance_year_market_cap }),
  });
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

function relativeValuation(
  target: ScreenerRow,
  selected: readonly ReturnType<typeof scoredCandidate>[],
) {
  const definitions = [
    {
      metric: "price_earnings_ttm" as const,
      value: (row: ScreenerRow) => row.price_earnings_ttm,
    },
    {
      metric: "enterprise_value_ebitda_ttm" as const,
      value: (row: ScreenerRow) => row.enterprise_value_ebitda_ttm,
    },
    {
      metric: "enterprise_value_to_revenue_ttm" as const,
      value: (row: ScreenerRow) => row.enterprise_value_to_revenue_ttm,
    },
  ];
  return Object.freeze(
    definitions.flatMap((definition) => {
      const values = selected
        .map((item) => definition.value(item.candidate))
        .filter((value): value is number => value != null && value > 0);
      if (values.length < 3) return [];
      const peerMedian = median(values);
      const subjectValue = definition.value(target);
      return [
        Object.freeze({
          metric: definition.metric,
          peerMedian: Number(peerMedian.toFixed(4)),
          peerCount: values.length,
          ...(subjectValue == null
            ? {}
            : {
                subjectValue,
                premiumDiscountPercent: Number(
                  ((subjectValue / peerMedian - 1) * 100).toFixed(2),
                ),
              }),
        }),
      ];
    }),
  );
}

export function createInsightSentryPeerScreen(input: {
  readonly client: InsightSentryClient;
  readonly dataRoot: string;
  readonly asOf: string;
  readonly annualAccessionNumber: string;
  readonly annualText: string;
}): PeerScreen {
  return async ({ symbol, limit }) => {
    const now = Date.parse(input.asOf);
    const key = [
      SELECTOR_VERSION,
      symbol.toUpperCase(),
      input.annualAccessionNumber,
    ].join("|");
    const cached = await readSelection(input.dataRoot, key, now);
    const universe = await collectUniverse(input.client, input.asOf);
    const target = universe.rows.find(
      (row) => row.symbol_code.toUpperCase() === symbol.toUpperCase(),
    );
    if (target === undefined || target.sector == null)
      throw new RangeError("peer target missing from stock screener");

    const bySymbol = new Map(
      universe.rows.map((row) => [row.symbol_code.toUpperCase(), row]),
    );
    const normalizedAnnualText = input.annualText.toLowerCase();
    const cachedRows =
      cached?.selected.flatMap((item) => {
        const row = bySymbol.get(item.symbol.toUpperCase());
        return row === undefined
          ? []
          : [
              {
                ...scoredCandidate(target, row, normalizedAnnualText),
                classification: item.classification,
              },
            ];
      }) ?? [];
    const useCache = cachedRows.length >= MIN_PEERS;
    const selected = useCache
      ? cachedRows.slice(0, limit)
      : selectPeers({
          target,
          universe: universe.rows,
          normalizedAnnualText,
          limit: Math.min(DEFAULT_PEERS, limit),
        });
    if (selected.length < MIN_PEERS)
      throw new RangeError("insufficient comparable companies");
    if (!useCache) {
      const createdAt = new Date(now).toISOString();
      await writeSelection(input.dataRoot, {
        key,
        createdAt,
        expiresAt: new Date(now + SELECTION_TTL).toISOString(),
        selected: selected.map((item) => ({
          symbol: item.candidate.symbol_code,
          classification: item.classification,
        })),
      });
    }
    return Object.freeze({
      providerUpdatedAt: universe.retrievedAt,
      retrievedAt: universe.retrievedAt,
      sector: target.sector,
      selectorVersion: SELECTOR_VERSION,
      selectionCache: useCache ? ("hit" as const) : ("miss" as const),
      subject: toSubjectMetrics(target),
      relativeValuation: relativeValuation(target, selected),
      peers: Object.freeze(
        selected.map((item) => toPeerRecord(item, item.classification)),
      ),
    });
  };
}

import type {
  NewsDataset,
  NewsEventCard,
} from "../server/data/insightsentry/insightSentryResearchContracts";

export type ResearchTeam = "market" | "company" | "financial" | "risk";

const TEAM_LENS: Readonly<Record<ResearchTeam, string>> = {
  market: "price_regime_relative_strength_and_timing",
  company: "demand_product_moat_and_execution",
  financial: "earnings_cash_flow_margins_and_valuation",
  risk: "downside_path_probability_and_early_warning",
};

const TEAM_TERMS: Readonly<Record<ResearchTeam, RegExp>> = {
  market:
    /premarket|after.?hours|analyst|price target|rating|sector|index|yield|rate|inflation|volume|momentum|technical|장전|시간외|애널리스트|목표주가|등급|섹터|지수|금리|물가|거래량|모멘텀|기술적/iu,
  company:
    /product|launch|customer|contract|order|shipment|production|pricing|partnership|supplier|demand|market share|adoption|retention|제품|출시|고객|계약|수주|출하|생산|가격|파트너십|공급사|수요|점유율|채택|유지율/iu,
  financial:
    /earnings?|guidance|outlook|forecast|revenue|sales|margin|profit|eps|cash flow|free cash|dividend|buyback|repurchase|capex|debt|financing|valuation|실적|가이던스|전망|매출|마진|이익|현금흐름|배당|자사주|설비투자|부채|조달|밸류에이션/iu,
  risk: /regulat|lawsuit|investigation|sanction|recall|breach|tariff|ban|restriction|shortage|delay|default|fraud|concentration|규제|소송|조사|제재|리콜|침해|관세|금지|제한|부족|지연|부도|사기|집중/iu,
};

function scoreForTeam(
  event: NewsEventCard,
  team: ResearchTeam,
  excerpt?: string,
): number {
  const text = `${event.title} ${excerpt ?? ""}`;
  let score = event.relevance * 10;
  if (TEAM_TERMS[team].test(text)) score += 5;
  if (event.category === team) score += 4;
  if (team === "financial" && event.category === "company") score += 1;
  if (team === "market" && event.horizon === "immediate") score += 2;
  if (team === "company" && event.horizon === "long_term") score += 2;
  if (team === "financial" && event.horizon !== "immediate") score += 1;
  if (
    team === "risk" &&
    (event.direction === "negative" || event.direction === "mixed")
  )
    score += 2;
  if (team === "risk" && event.verificationNeed === "required") score += 1;
  return score;
}

export function routeNewsForTeam(input: {
  readonly dataset: NewsDataset;
  readonly team: ResearchTeam;
  readonly limit?: number;
}) {
  const excerptsByEventKey = new Map(
    input.dataset.excerpts.map((excerpt) => [
      excerpt.eventKey,
      excerpt.content,
    ]),
  );
  const eligible = input.dataset.events.filter((event) =>
    event.teamRelevance.includes(input.team),
  );
  const selected = [...eligible]
    .sort(
      (left, right) =>
        scoreForTeam(
          right,
          input.team,
          excerptsByEventKey.get(right.eventKey),
        ) -
          scoreForTeam(
            left,
            input.team,
            excerptsByEventKey.get(left.eventKey),
          ) ||
        right.publishedAt.localeCompare(left.publishedAt) ||
        left.eventKey.localeCompare(right.eventKey),
    )
    .slice(0, input.limit ?? 6);
  const selectedKeys = new Set(selected.map((event) => event.eventKey));
  return Object.freeze({
    ...input.dataset,
    teamLens: TEAM_LENS[input.team],
    routing: Object.freeze({
      sharedEventCount: input.dataset.events.length,
      eligibleEventCount: eligible.length,
      selectedEventCount: selected.length,
    }),
    events: Object.freeze(selected),
    excerpts: Object.freeze(
      input.dataset.excerpts.filter((excerpt) =>
        selectedKeys.has(excerpt.eventKey),
      ),
    ),
    providerEvidence: Object.freeze(
      selected.flatMap((event) =>
        event.link === undefined ? [] : [event.link],
      ),
    ),
  });
}

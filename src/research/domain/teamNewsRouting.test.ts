import { describe, expect, it } from "vitest";
import type {
  NewsDataset,
  NewsEventCard,
} from "../server/data/insightsentry/insightSentryResearchContracts";
import { routeNewsForTeam } from "./teamNewsRouting";

function event(
  eventKey: string,
  title: string,
  category: NewsEventCard["category"],
  teams: NewsEventCard["teamRelevance"],
  input: Partial<NewsEventCard> = {},
): NewsEventCard {
  return {
    eventKey,
    title,
    category,
    teamRelevance: teams,
    relevance: 0.8,
    direction: "neutral",
    horizon: "near_term",
    verificationNeed: "recommended",
    publishedAt: "2026-08-10T00:00:00.000Z",
    link: `https://example.com/${eventKey}`,
    ...input,
  };
}

describe("routeNewsForTeam", () => {
  it("routes one shared event ledger through distinct team lenses", () => {
    const events = [
      event(
        "earnings",
        "Revenue guidance and free cash flow margin rise",
        "company",
        ["company", "financial"],
      ),
      event(
        "product",
        "Customer adoption accelerates after product launch",
        "company",
        ["company"],
        { horizon: "long_term" },
      ),
      event(
        "price",
        "Premarket volume rises as analyst lifts price target",
        "market",
        ["market"],
        { horizon: "immediate" },
      ),
      event(
        "risk",
        "Regulatory investigation raises customer concentration risk",
        "risk",
        ["risk"],
        {
          direction: "negative",
          verificationNeed: "required",
        },
      ),
    ];
    const dataset = {
      symbol: "NASDAQ:TEST",
      providerUpdatedAt: "2026-08-10T00:00:00.000Z",
      retrievedAt: "2026-08-10T00:00:00.000Z",
      pitUnsafe: true,
      providerCalls: 1,
      rawItemCount: 4,
      events,
      excerpts: events.map((item) => ({
        eventKey: item.eventKey,
        content: `${item.title} detail`,
      })),
      providerEvidence: events.flatMap((item) =>
        item.link === undefined ? [] : [item.link],
      ),
    } as unknown as NewsDataset;

    const market = routeNewsForTeam({ dataset, team: "market" });
    const company = routeNewsForTeam({ dataset, team: "company" });
    const financial = routeNewsForTeam({ dataset, team: "financial" });
    const risk = routeNewsForTeam({ dataset, team: "risk" });

    expect(market.events.map((item) => item.eventKey)).toEqual(["price"]);
    expect(company.events.map((item) => item.eventKey)).toEqual([
      "product",
      "earnings",
    ]);
    expect(financial.events.map((item) => item.eventKey)).toEqual(["earnings"]);
    expect(risk.events.map((item) => item.eventKey)).toEqual(["risk"]);
    expect(financial.teamLens).toBe("earnings_cash_flow_margins_and_valuation");
    expect(company.routing).toEqual({
      sharedEventCount: 4,
      eligibleEventCount: 2,
      selectedEventCount: 2,
    });
  });
});

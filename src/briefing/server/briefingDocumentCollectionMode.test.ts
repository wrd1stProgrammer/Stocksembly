import { describe, expect, it } from "vitest";
import { createInsightSentryResearchDataAdapter } from "../../research/server/data/insightsentry/insightSentryResearchData";
import {
  AS_OF,
  fixtureClient,
  ROLLOUT,
} from "../../research/server/data/insightsentry/insightSentryResearchData.testSupport";
import { buildBriefingFinancialContext } from "./briefingFinancialContext";

describe("briefing document collection mode", () => {
  it("preserves a deep issuer metric until briefing excerpt selection", async () => {
    const content = `Official Q2 report ${"x".repeat(20_000)} deliveries reached a quarterly record`;
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          document_index: [
            {
              id: "report:q2-2026",
              category: "Quarterly report",
              reported_time: 1_784_755_800,
              is_available: true,
              title: "Q2 2026",
              is_pdf: true,
              fiscal_period: "Q2",
              fiscal_year: 2026,
              form: "10-Q",
            },
          ],
          document: {
            title: "Q2 2026",
            published_at: 1_784_755_800,
            content,
          },
        },
        [],
      ),
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    const [research, briefing] = await Promise.all([
      adapter.documents({ symbol: "NASDAQ:TSLA", asOf: AS_OF }),
      adapter.documents({
        symbol: "NASDAQ:TSLA",
        asOf: AS_OF,
        collectionMode: "briefing",
      }),
    ]);
    const researchDocument =
      research.status === "available" ? research.data.documents[0] : undefined;
    const briefingDocument =
      briefing.status === "available" ? briefing.data.documents[0] : undefined;
    const financialContext = buildBriefingFinancialContext({
      symbol: "TSLA",
      documents: briefingDocument === undefined ? [] : [briefingDocument],
      cutoffAt: "2026-08-10T20:35:29.094Z",
    });

    expect(researchDocument?.content).toHaveLength(12_000);
    expect(briefingDocument?.content).toContain("deliveries");
    expect(financialContext?.documents[0]?.excerpt).toContain("deliveries");
    expect(financialContext?.documents[0]?.excerpt.length).toBeLessThanOrEqual(
      480,
    );
  });
});

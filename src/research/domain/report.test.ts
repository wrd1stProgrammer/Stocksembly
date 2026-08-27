import { describe, expect, it } from "vitest";
import { buildResearchFileEditorialModel } from "../researchFileEditorialModel";
import { researchReportToFile } from "../researchReportToFile";
import { ClaimIdSchema } from "./ids";
import { ResearchReportSchema } from "./report";
import { reportTestIds as ids, validReport } from "./report.testSupport";

describe("ResearchReportSchema", () => {
  it("accepts all twelve artifacts with unavailable market capability as limited", () => {
    const parsed = ResearchReportSchema.parse(validReport());
    expect(parsed.status).toBe("complete_with_limitations");
    expect(parsed.artifacts).toHaveLength(12);
    expect(parsed.dataCoverage[0]?.status).toBe("available");
    expect(parsed.providerDisagreements[0]?.authoritativeSource).toBe(
      "sec_company_facts",
    );
  });

  it("rejects reversed observed coverage and non-SEC provider authority", () => {
    const report = validReport();
    expect(
      ResearchReportSchema.safeParse({
        ...report,
        dataCoverage: [
          {
            ...report.dataCoverage[0],
            observedFrom: "2026-01-02T00:00:00.000Z",
            observedTo: "2026-01-01T00:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ResearchReportSchema.safeParse({
        ...report,
        providerDisagreements: [
          {
            ...report.providerDisagreements[0],
            authoritativeSource: "insightsentry_rapidapi",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts an NVDA provider-2xx publication with observed bar coverage", () => {
    const report = validReport();
    const available = {
      ...report,
      status: "complete",
      marketSnapshot: {
        providerCode: "NASDAQ:NVDA",
        lastPrice: 172.41,
        currency: "USD",
        observedAt: "2026-07-22T20:00:00.000Z",
        marketState: "CLOSED",
      },
      capabilities: [
        { key: "official_filings", availability: "available" },
        { key: "insightsentry_provider", availability: "available" },
        { key: "current_market_data", availability: "available" },
      ],
      limitations: [],
      sources: report.sources.map((source) =>
        source.sourceId === ids.providerSource
          ? {
              ...source,
              dataset: "market_bars",
              providerStatus: "available",
              limitations: undefined,
              observedPeriod: {
                from: "2026-06-01T13:30:00.000Z",
                to: "2026-07-22T20:00:00.000Z",
                observationCount: 780,
              },
            }
          : source,
      ),
      dataCoverage: report.dataCoverage.map((coverage) =>
        coverage.dataset === "insightsentry_request_ledger"
          ? {
              dataset: "market_bars",
              provider: "InsightSentry via RapidAPI",
              status: "available",
              observedFrom: "2026-06-01T13:30:00.000Z",
              observedTo: "2026-07-22T20:00:00.000Z",
              observationCount: 780,
            }
          : coverage,
      ),
      providerDisagreements: [
        {
          ...report.providerDisagreements[0],
          status: "none_observed",
          note: {
            en: "No material disagreement was observed; SEC values remain authoritative.",
            ko: "중대한 불일치는 관측되지 않았으며 SEC 값을 기준으로 유지합니다.",
          },
        },
      ],
    };

    const parsed = ResearchReportSchema.parse(available);
    expect(parsed.status).toBe("complete");
    expect(
      parsed.dataCoverage.find(
        (coverage) => coverage.dataset === "market_bars",
      ),
    ).toMatchObject({ status: "available", observationCount: 780 });
    const file = researchReportToFile(parsed, "2026-07-24T00:00:00.000Z");
    expect(file.marketSnapshot).toMatchObject({
      price: "172.41",
      currency: "USD",
    });
    expect(file.valuation.ko).toContain("현재가 172.41 USD");
    expect(file.limitationNote.ko).not.toContain("사용할 수 없습니다");
    expect(
      file.evidenceIndex.some((source) =>
        source.publisher.includes("InsightSentry"),
      ),
    ).toBe(false);
  });

  it("preserves the decision rationale and valuation evidence beyond the opening sentence", () => {
    const report = validReport();
    const sections = {
      en: [
        {
          id: "ten_second_brief",
          title: "Ten-second brief",
          claimIds: [ids.claim],
          sourceIds: [ids.source],
          body: "The current view is cautious. Demand improved, but profitability weakened. Margin recovery must be sustained before the view turns constructive.",
        },
        {
          id: "supported_analysis",
          title: "Valuation evidence",
          claimIds: [ids.claim],
          sourceIds: [ids.source],
          body: "The observed price demands careful interpretation. Operating margin fell despite revenue growth. Liquidity cushions downside but does not prove profitable growth.",
        },
      ],
      ko: [
        {
          id: "ten_second_brief",
          title: "10초 요약",
          claimIds: [ids.claim],
          sourceIds: [ids.source],
          body: "현재 판단은 신중합니다. 수요는 개선됐지만 수익성은 약해졌습니다. 마진 회복이 지속돼야 판단을 상향할 수 있습니다.",
        },
        {
          id: "supported_analysis",
          title: "밸류에이션 근거",
          claimIds: [ids.claim],
          sourceIds: [ids.source],
          body: "관찰 가격은 신중한 해석을 요구합니다. 매출 성장에도 영업마진은 하락했습니다. 유동성은 하방을 완충하지만 수익성 있는 성장을 입증하지는 못합니다.",
        },
      ],
    } as const;
    const parsed = ResearchReportSchema.parse({
      ...report,
      status: "complete",
      marketSnapshot: {
        providerCode: "NASDAQ:TSLA",
        lastPrice: 313.03,
        currency: "USD",
        observedAt: "2026-07-24T20:00:00.000Z",
        marketState: "CLOSED",
      },
      capabilities: report.capabilities.map((capability) => ({
        key: capability.key,
        availability: "available",
      })),
      limitations: [],
      locales: {
        en: { ...report.locales.en, sections: sections.en },
        ko: { ...report.locales.ko, sections: sections.ko },
      },
    });

    const file = researchReportToFile(parsed, "2026-07-26T00:00:00.000Z");

    expect(file.thesis.ko).toContain(
      "수요는 개선됐지만 수익성은 약해졌습니다.",
    );
    expect(file.valuation.ko).toContain(
      "매출 성장에도 영업마진은 하락했습니다.",
    );
  });

  it("keeps evidence-linked supporting claims in a focused team report", () => {
    const report = ResearchReportSchema.parse(validReport());
    const material = report.claims[0];
    if (material === undefined) throw new TypeError("fixture claim missing");
    const supporting = {
      ...material,
      claimId: ClaimIdSchema.parse("00000000-0000-4000-8000-000000000099"),
      materiality: "supporting" as const,
      text: {
        en: "A second specialist finding is supported by the sealed evidence.",
        ko: "두 번째 전문 분석 판단도 봉인된 근거로 뒷받침됩니다.",
      },
    };

    const file = researchReportToFile(
      {
        ...report,
        researchTarget: { kind: "department", departmentId: "market" },
        claims: [
          {
            ...material,
            materiality: "material",
            text: {
              en: "The primary specialist finding is supported by sealed evidence.",
              ko: "첫 번째 전문 분석 판단은 봉인된 근거로 뒷받침됩니다.",
            },
          },
          supporting,
        ],
      },
      "2026-07-30T00:00:00.000Z",
    );

    expect(file.claimMatrix).toHaveLength(2);
    expect(file.claimMatrix?.[1]).toMatchObject({
      verdict: supporting.semanticVerdict,
      sourceCount: supporting.sourceIds.length,
    });
    expect(file.claimMatrix?.[1]?.strength).not.toBe("unverified");
    const editorial = buildResearchFileEditorialModel(file, "ko");
    expect(editorial.analysisRows).toHaveLength(2);
    expect(
      editorial.analysisRows.every((row) => row.strength !== "unverified"),
    ).toBe(true);
  });

  it("accepts an NVDA 403-limited publication with an explicit provider limitation", () => {
    const parsed = ResearchReportSchema.parse(validReport());
    expect(parsed.status).toBe("complete_with_limitations");
    expect(
      parsed.dataCoverage.find(
        (coverage) => coverage.dataset === "insightsentry_request_ledger",
      ),
    ).toMatchObject({
      status: "unavailable",
      limitation: "subscription_required",
    });
    const file = researchReportToFile(parsed, "2026-07-24T00:00:00.000Z");
    expect(file.appendix.at(-2)?.items[1]?.en).toContain(
      "subscription_required",
    );
    expect(file.appendix.at(-1)?.items[0]?.en).toContain(
      "SEC values remain authoritative",
    );
  });

  it("accepts capability-consistent complete, limited, and incomplete statuses", () => {
    const limited = validReport();
    expect(ResearchReportSchema.safeParse(limited).success).toBe(true);
    expect(
      ResearchReportSchema.safeParse({ ...limited, status: "incomplete" })
        .success,
    ).toBe(true);
    expect(
      ResearchReportSchema.safeParse({
        ...limited,
        status: "complete",
        capabilities: limited.capabilities.map((capability) => ({
          key: capability.key,
          availability: "available",
        })),
        limitations: [],
      }).success,
    ).toBe(true);
  });

  it("rejects Korean-only and mismatched localized IDs or counts", () => {
    const report = validReport();
    const koreanOnly = {
      ...report,
      locales: { ko: report.locales.ko },
    };
    expect(ResearchReportSchema.safeParse(koreanOnly).success).toBe(false);

    const mismatch = {
      ...report,
      locales: {
        ...report.locales,
        ko: { ...report.locales.ko, sections: [] },
      },
    };
    expect(ResearchReportSchema.safeParse(mismatch).success).toBe(false);
  });

  it("rejects undefined or zero metric denominators", () => {
    const zero = {
      ...validReport(),
      metrics: [{ id: "citation-validity", passed: 0, denominator: 0 }],
    };
    expect(ResearchReportSchema.safeParse(zero).success).toBe(false);
    const missing = {
      ...validReport(),
      metrics: [{ id: "citation-validity", passed: 1 }],
    };
    expect(ResearchReportSchema.safeParse(missing).success).toBe(false);
  });

  it.each([
    "price",
    "ohlcv",
    "targetPrice",
    "entryPrice",
    "stopPrice",
    "recommendation",
  ])("rejects forbidden market field %s", (field) =>
    expect(
      ResearchReportSchema.safeParse({ ...validReport(), [field]: "BUY" })
        .success,
    ).toBe(false),
  );

  it.each([
    "target price $123",
    "OHLCV",
    "entry 123",
    "stop 90",
    "target 150",
    "position 5%",
  ])("rejects guessed market narrative %s", (body) => {
    const report = validReport();
    const invalid = {
      ...report,
      locales: {
        ...report.locales,
        en: {
          ...report.locales.en,
          sections: [{ ...report.locales.en.sections[0], body }],
        },
      },
    };
    expect(ResearchReportSchema.safeParse(invalid).success).toBe(false);
  });

  it("allows explicit investment-rating language in narrative", () => {
    const report = validReport();
    const valid = {
      ...report,
      locales: {
        ...report.locales,
        en: {
          ...report.locales.en,
          sections: [
            {
              ...report.locales.en.sections[0],
              body: "BUY because the cited operating evidence supports expansion.",
            },
          ],
        },
      },
    };

    expect(ResearchReportSchema.safeParse(valid).success).toBe(true);
  });

  it("allows ordinary lowercase buy language that is not an investment rating", () => {
    const report = validReport();
    const valid = {
      ...report,
      locales: {
        ...report.locales,
        en: {
          ...report.locales.en,
          sections: [
            {
              ...report.locales.en.sections[0],
              body: "Customers can develop or buy competing solutions.",
            },
          ],
        },
      },
    };

    expect(ResearchReportSchema.safeParse(valid).success).toBe(true);
  });

  it("allows cited current prices inside an evidence-bound narrative", () => {
    const report = validReport();
    const valid = {
      ...report,
      locales: {
        ...report.locales,
        en: {
          ...report.locales.en,
          sections: [
            {
              ...report.locales.en.sections[0],
              body: "The current price is $311.29, below both cited four-hour moving averages.",
            },
          ],
        },
      },
    };
    expect(ResearchReportSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid status and cross-lineage delta", () => {
    expect(
      ResearchReportSchema.safeParse({ ...validReport(), status: "completed" })
        .success,
    ).toBe(false);
    const crossLineage = {
      ...validReport(),
      versionDelta: {
        priorVersionId: "00000000-0000-4000-8000-000000000099",
        priorRunId: "00000000-0000-4000-8000-000000000098",
        addedClaimIds: [ids.claim],
        removedClaimIds: [],
      },
    };
    expect(ResearchReportSchema.safeParse(crossLineage).success).toBe(false);
  });

  it("rejects counterpart claim/source citation drift", () => {
    const report = validReport();
    const drift = {
      ...report,
      locales: {
        ...report.locales,
        ko: {
          ...report.locales.ko,
          sections: [
            {
              ...report.locales.ko.sections[0],
              claimIds: ["00000000-0000-4000-8000-000000000099"],
            },
          ],
          scenarios: [
            {
              ...report.locales.ko.scenarios[0],
              sourceIds: ["00000000-0000-4000-8000-000000000098"],
            },
          ],
        },
      },
    };
    expect(ResearchReportSchema.safeParse(drift).success).toBe(false);
  });

  it("rejects dissent counterpart claim drift even when both claims are registered", () => {
    const report = validReport();
    const otherClaimId = "00000000-0000-4000-8000-000000000097";
    const drift = {
      ...report,
      claims: [
        ...report.claims,
        {
          claimId: otherClaimId,
          materiality: "supporting",
          semanticVerdict: "entailed",
          sourceIds: [ids.source],
        },
      ],
      locales: {
        ...report.locales,
        ko: {
          ...report.locales.ko,
          dissent: [{ ...report.locales.ko.dissent[0], claimId: otherClaimId }],
        },
      },
    };
    expect(ResearchReportSchema.safeParse(drift).success).toBe(false);
  });

  it("rejects complete status with unavailable market or consensus", () => {
    expect(
      ResearchReportSchema.safeParse({ ...validReport(), status: "complete" })
        .success,
    ).toBe(false);
  });

  it.each([
    { field: "status", value: "rejected" },
    { field: "runId", value: "00000000-0000-4000-8000-000000000099" },
    { field: "stage", value: "chair_synthesis" },
    { field: "logicalArtifactId", value: "memo:unexpected_market" },
  ])("rejects invalid artifact provenance $field", ({ field, value }) => {
    const report = validReport();
    const artifacts = report.artifacts.map((artifact, index) =>
      index === 0 ? { ...artifact, [field]: value } : artifact,
    );
    expect(
      ResearchReportSchema.safeParse({ ...report, artifacts }).success,
    ).toBe(false);
  });
});

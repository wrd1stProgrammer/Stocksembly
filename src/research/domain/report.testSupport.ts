export const reportTestIds = {
  run: "00000000-0000-4000-8000-000000000001",
  snapshot: "00000000-0000-4000-8000-000000000002",
  report: "00000000-0000-4000-8000-000000000003",
  version: "00000000-0000-4000-8000-000000000004",
  claim: "00000000-0000-4000-8000-000000000005",
  source: "00000000-0000-4000-8000-000000000006",
  providerSource: "00000000-0000-4000-8000-000000000007",
} as const;

const artifactRoles = [
  "market",
  "market_news",
  "benchmark",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
  "chair",
] as const;
const logicalArtifactIds = {
  market: "memo:market",
  market_news: "memo:market_news",
  benchmark: "memo:benchmark",
  company: "memo:company",
  company_product: "memo:company_product",
  company_competition: "memo:company_competition",
  financial: "memo:financial",
  valuation: "memo:valuation",
  financial_quality: "memo:financial_quality",
  risk: "memo:risk",
  risk_policy: "memo:risk_policy",
  chair: "chair_synthesis:chair",
} as const;

export function validReport() {
  const ids = reportTestIds;
  return {
    schemaVersion: "workflow-v1",
    reportId: ids.report,
    versionId: ids.version,
    version: 1,
    runId: ids.run,
    snapshotId: ids.snapshot,
    status: "complete_with_limitations",
    researchDirection: "Focus on margin durability and competitive pressure",
    teamViews: [
      {
        departmentId: "market",
        position: {
          en: "Demand remains constructive.",
          ko: "수요는 견조합니다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "Macro sensitivity remains.",
          ko: "거시 민감도가 남아 있습니다.",
        },
      },
      {
        departmentId: "company",
        position: {
          en: "The product moat is supported.",
          ko: "제품 해자가 뒷받침됩니다.",
        },
        vote: "support",
        rationale: {
          en: "Operating evidence is consistent.",
          ko: "영업 근거가 일관됩니다.",
        },
      },
      {
        departmentId: "financial",
        position: {
          en: "Margins are improving.",
          ko: "마진이 개선되고 있습니다.",
        },
        vote: "support_with_reservations",
        rationale: {
          en: "Valuation data is limited.",
          ko: "밸류에이션 데이터가 제한적입니다.",
        },
      },
      {
        departmentId: "risk",
        position: {
          en: "Policy risk is manageable.",
          ko: "정책 리스크는 관리 가능합니다.",
        },
        vote: "abstain",
        rationale: {
          en: "Key unknowns remain open.",
          ko: "핵심 미확인 사항이 남아 있습니다.",
        },
      },
    ],
    artifacts: artifactRoles.map((roleId, index) => ({
      artifactId: `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
      logicalArtifactId: logicalArtifactIds[roleId],
      roleId,
      stage: roleId === "chair" ? "chair_synthesis" : "memo",
      status: "accepted",
      runId: ids.run,
      snapshotId: ids.snapshot,
    })),
    capabilities: [
      { key: "sec_filings", availability: "available" },
      {
        key: "current_market_data",
        availability: "unavailable",
        limitationId: "lim-market",
      },
      {
        key: "consensus",
        availability: "unavailable",
        limitationId: "lim-consensus",
      },
    ],
    locales: {
      en: {
        sections: [
          {
            id: "ten-second-brief",
            title: "Ten-second brief",
            claimIds: [ids.claim],
            sourceIds: [ids.source],
            body: "Official filings show operating improvement.",
          },
        ],
        scenarios: [
          {
            id: "base-case",
            name: "Base",
            assumptions: [{ metric: "revenue", value: "100", unit: "USD" }],
            claimIds: [ids.claim],
            sourceIds: [ids.source],
          },
        ],
        dissent: [
          {
            id: "dissent-1",
            claimId: ids.claim,
            sourceIds: [ids.source],
            disposition: "retained",
            text: "Margin durability remains disputed.",
          },
        ],
        unknowns: [
          {
            id: "unknown-1",
            impact: "Could change the operating view.",
            nextEvidence: "Next quarterly filing.",
          },
        ],
      },
      ko: {
        sections: [
          {
            id: "ten-second-brief",
            title: "10초 요약",
            claimIds: [ids.claim],
            sourceIds: [ids.source],
            body: "공식 공시는 영업 개선을 보여 줍니다.",
          },
        ],
        scenarios: [
          {
            id: "base-case",
            name: "기준",
            assumptions: [{ metric: "revenue", value: "100", unit: "USD" }],
            claimIds: [ids.claim],
            sourceIds: [ids.source],
          },
        ],
        dissent: [
          {
            id: "dissent-1",
            claimId: ids.claim,
            sourceIds: [ids.source],
            disposition: "retained",
            text: "마진 지속성에는 이견이 있습니다.",
          },
        ],
        unknowns: [
          {
            id: "unknown-1",
            impact: "영업 관점을 바꿀 수 있습니다.",
            nextEvidence: "다음 분기 공시.",
          },
        ],
      },
    },
    versionDelta: {
      priorVersionId: null,
      addedClaimIds: [ids.claim],
      removedClaimIds: [],
    },
    claims: [
      {
        claimId: ids.claim,
        materiality: "material",
        semanticVerdict: "entailed",
        sourceIds: [ids.source],
      },
    ],
    sources: [
      {
        sourceId: ids.source,
        title: "Annual report",
        publisher: "SEC",
        sourceClass: "official_filing",
        dataset: "sec_filing",
        providerStatus: "available",
        observedPeriod: {
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-12-31T00:00:00.000Z",
          observationCount: 1,
        },
        retrievedAt: "2026-07-22T00:00:00.000Z",
      },
      {
        sourceId: ids.providerSource,
        title: "insightsentry:request-ledger",
        publisher: "InsightSentry via RapidAPI",
        sourceClass: "insightsentry_rapidapi",
        dataset: "insightsentry_request_ledger",
        providerStatus: "unavailable",
        limitations: ["subscription_required"],
        retrievedAt: "2026-07-22T00:00:00.000Z",
        excerpt:
          '{"symbol":"NASDAQ:NVDA","uniqueUpstreamCalls":1,"status":"unavailable"}',
      },
    ],
    dataCoverage: [
      {
        dataset: "sec_filing",
        provider: "SEC",
        status: "available",
        observedFrom: "2025-01-01T00:00:00.000Z",
        observedTo: "2025-12-31T00:00:00.000Z",
        observationCount: 1,
      },
      {
        dataset: "insightsentry_request_ledger",
        provider: "InsightSentry via RapidAPI",
        status: "unavailable",
        limitation: "subscription_required",
      },
    ],
    providerDisagreements: [
      {
        id: "insightsentry-sec-authority",
        authoritativeSource: "sec_company_facts",
        comparedSource: "insightsentry_rapidapi",
        status: "not_comparable",
        note: {
          en: "SEC values remain authoritative; no comparable provider value was published.",
          ko: "SEC 값이 기준이며 비교 가능한 공급자 값은 게시되지 않았습니다.",
        },
      },
    ],
    metrics: [
      { id: "citation-validity", passed: 1, denominator: 1 },
      { id: "semantic-entailment", passed: 1, denominator: 1 },
    ],
    limitations: [
      { id: "lim-market", capability: "current_market_data" },
      { id: "lim-consensus", capability: "consensus" },
    ],
  };
}

import { WorkflowV2ResearchReportSchema } from "./domain/report";
import { researchReportToFile } from "./researchReportToFile";
import { workflowV2PresentationFixture } from "./workflowV2Presentation.testSupport";

const financialClaimId = "00000000-0000-4000-8000-000000000099";
const catalystClaimId = "00000000-0000-4000-8000-000000000094";
const timelineCatalystId = "00000000-0000-4000-8000-000000000091";
const analysisClaimId = "00000000-0000-4000-8000-000000000092";
const financialOriginClaimId = "00000000-0000-4000-8000-000000000093";

export function committeeReportPreviewFixture() {
  const report = workflowV2PresentationFixture();
  const registered = report.claims[0];
  const sourceId = report.editorialClaims[0]?.evidenceArtifactIds[0];
  if (registered === undefined || sourceId === undefined)
    throw new TypeError("committee preview fixture is incomplete");
  const sourceCompanyDriver = report.editorialClaims[0];
  const sourceRiskDriver = report.editorialClaims[1];
  if (sourceCompanyDriver === undefined || sourceRiskDriver === undefined)
    throw new TypeError("committee preview drivers are incomplete");
  const companyDriver = {
    ...sourceCompanyDriver,
    publicThesis: {
      en: "Platform adoption beyond accelerators is the clearest proof that the growth engine can endure the current product cycle.",
      ko: "가속기 밖으로 확장되는 플랫폼 채택은 성장 엔진이 현재 제품 주기를 넘어 지속될 수 있다는 가장 분명한 근거입니다.",
    },
    falsifier: {
      en: "Production workloads moving off the platform without switching penalties would invalidate this claim.",
      ko: "전환 비용 없이 운영 워크로드가 플랫폼 밖으로 이동하면 이 주장은 무효화됩니다.",
    },
  };
  const riskDriver = {
    ...sourceRiskDriver,
    publicThesis: {
      en: "Policy exposure and customer concentration remain the fastest credible downside path to expected cash flows.",
      ko: "정책 노출과 고객 집중은 예상 현금흐름을 훼손할 수 있는 가장 빠르고 현실적인 하방 경로입니다.",
    },
    falsifier: {
      en: "Broader customer mix and stable approvals would invalidate this downside path.",
      ko: "고객 구성이 넓어지고 승인 흐름이 안정되면 이 하방 경로는 무효화됩니다.",
    },
  };
  const financialDriver = {
    claimId: financialClaimId,
    decisionDimension: "cash_conversion" as const,
    roleOwner: "financial" as const,
    stanceContribution: "supports" as const,
    materiality: "material" as const,
    publicThesis: {
      en: "Durable cash conversion must fund the reinvestment required by current expectations.",
      ko: "지속적인 현금 전환이 현재 기대에 필요한 재투자를 뒷받침해야 합니다.",
    },
    evidenceArtifactIds: [sourceId],
    counterevidenceArtifactIds: [],
    decisiveMetricIds: [],
    falsifier: {
      en: "Repeated cash conversion deterioration despite margin improvement would invalidate this claim.",
      ko: "마진 개선에도 현금 전환이 반복적으로 악화되면 이 주장은 무효화됩니다.",
    },
  };
  const catalyst = {
    claimId: catalystClaimId,
    decisionDimension: "catalyst" as const,
    roleOwner: "market" as const,
    stanceContribution: "supports" as const,
    materiality: "material" as const,
    publicThesis: {
      en: "2026-08-28 earnings release tests whether operating proof is catching up with expectations.",
      ko: "2026-08-28 실적 발표에서 영업 근거가 시장 기대를 따라잡는지 확인합니다.",
    },
    evidenceArtifactIds: [sourceId],
    counterevidenceArtifactIds: [],
    decisiveMetricIds: [],
    falsifier: {
      en: "The event matters only if reported execution changes the committee's evidence balance.",
      ko: "공시된 실행 결과가 위원회의 근거 균형을 바꿀 때만 이 이벤트가 중요합니다.",
    },
  };
  const timelineCatalyst = {
    ...catalyst,
    claimId: timelineCatalystId,
    roleOwner: "company" as const,
    publicThesis: {
      en: "2026-09-15 hyperscaler capital-spending updates test whether deployment breadth is expanding.",
      ko: "2026-09-15 하이퍼스케일러 자본지출 업데이트에서 배치 범위가 확장되는지 확인합니다.",
    },
    falsifier: {
      en: "Flat deployment breadth despite higher budgets would weaken this catalyst.",
      ko: "예산 증가에도 배치 범위가 정체되면 이 촉매의 의미가 약해집니다.",
    },
  };
  const ownedAnalysis = {
    ...companyDriver,
    claimId: analysisClaimId,
    decisionDimension: "moat" as const,
    materiality: "supporting" as const,
    publicThesis: {
      en: "Developer tooling and switching friction provide a separate test of ecosystem durability.",
      ko: "개발자 도구와 전환 마찰은 생태계 지속성을 검증하는 별도의 기준입니다.",
    },
    falsifier: {
      en: "Rapid migration with low retraining cost would weaken the ecosystem advantage.",
      ko: "낮은 재교육 비용으로 빠르게 이전할 수 있다면 생태계 우위가 약해집니다.",
    },
  };
  const complete = WorkflowV2ResearchReportSchema.parse({
    ...report,
    marketSnapshot: {
      providerCode: "NVDA",
      lastPrice: 172.41,
      change: 3.04,
      changePercent: 1.79,
      currency: "USD",
      observedAt: "2026-07-31T20:00:00.000Z",
      marketState: "CLOSED",
    },
    teamViews: report.teamViews.map((team) =>
      team.departmentId === "company"
        ? {
            ...team,
            rationale: {
              en: "Customer workflow retention determines whether platform breadth converts into durable demand.",
              ko: "고객 워크플로 유지 여부는 플랫폼의 확장성이 지속적인 수요로 전환되는지를 결정합니다.",
            },
          }
        : team.departmentId === "risk"
          ? {
              ...team,
              rationale: {
                en: "Export approvals and customer mix reveal deterioration before reported revenue catches up.",
                ko: "수출 승인과 고객 구성은 매출 공시에 반영되기 전에 악화 신호를 보여줍니다.",
              },
            }
          : team.departmentId === "financial"
            ? {
                ...team,
                rationale: {
                  en: "Cash conversion determines whether improving margins can fund the growth implied by the current valuation.",
                  ko: "현금 전환은 개선된 마진이 현재 밸류에이션에 내재된 성장을 조달할 수 있는지를 결정합니다.",
                },
              }
            : team,
    ),
    claims: [
      ...report.claims.map((claim) =>
        claim.claimId === companyDriver.claimId
          ? {
              ...claim,
              text: companyDriver.publicThesis,
              disposition: "accepted" as const,
            }
          : claim.claimId === riskDriver.claimId
            ? {
                ...claim,
                text: riskDriver.publicThesis,
                disposition: "accepted" as const,
              }
            : claim,
      ),
      {
        ...registered,
        claimId: financialClaimId,
        text: financialDriver.publicThesis,
        disposition: "revised",
        originClaimId: financialOriginClaimId,
        revisionHash: "a".repeat(64),
        adjudicationReason: {
          en: "Revised to isolate cash conversion from operating margin.",
          ko: "현금 전환을 영업 마진과 분리해 판단하도록 수정했습니다.",
        },
      },
      {
        ...registered,
        claimId: catalystClaimId,
        text: catalyst.publicThesis,
        disposition: "accepted",
      },
      {
        ...registered,
        claimId: timelineCatalystId,
        text: timelineCatalyst.publicThesis,
        disposition: "accepted",
      },
      {
        ...registered,
        claimId: analysisClaimId,
        text: ownedAnalysis.publicThesis,
        disposition: "accepted",
      },
    ],
    editorialClaims: [
      companyDriver,
      riskDriver,
      financialDriver,
      catalyst,
      timelineCatalyst,
      ownedAnalysis,
    ],
    editorialDecision: {
      ...report.editorialDecision,
      primaryClaimIds: [
        ...report.editorialDecision.primaryClaimIds,
        financialClaimId,
      ],
    },
  });
  return researchReportToFile(complete, "2026-07-31T20:00:00.000Z");
}

import type { PublicRun } from "../../research/client/schemas";
import type { LandingResearchRoomPreviewData } from "../researchRoom/landingResearchRoomPreviewSelection";
import { LANDING_COMPANY_NAME_FALLBACKS } from "../researchRoom/landingResearchRoomPreviewSelection";

// Sample data for the localhost-only home preview (?home=preview), where
// Cognito sign-in and the research database are unavailable.
export const HOME_PREVIEW_RUNS: readonly PublicRun[] = [
  {
    runId: "00000000-0000-4000-8000-000000000001",
    snapshotId: "00000000-0000-4000-8000-000000000011",
    symbol: "NVDA",
    question: "성장률이 현재 밸류에이션을 정당화할까?",
    locale: "ko",
    status: "completed",
    lastEventSeq: 42,
    createdAt: "2026-09-05T09:30:00.000Z",
  },
  {
    runId: "00000000-0000-4000-8000-000000000002",
    snapshotId: "00000000-0000-4000-8000-000000000012",
    symbol: "TSLA",
    question: "로보택시 없이도 마진 회복이 가능한가?",
    locale: "ko",
    status: "running",
    lastEventSeq: 12,
    createdAt: "2026-09-06T11:05:00.000Z",
  },
  {
    runId: "00000000-0000-4000-8000-000000000003",
    snapshotId: "00000000-0000-4000-8000-000000000013",
    symbol: "MSFT",
    question: "AI 투자 회수 구간은 언제부터인가?",
    locale: "ko",
    status: "complete-with-limitations",
    lastEventSeq: 40,
    createdAt: "2026-09-04T22:10:00.000Z",
  },
  {
    runId: "00000000-0000-4000-8000-000000000004",
    snapshotId: "00000000-0000-4000-8000-000000000014",
    symbol: "AAPL",
    locale: "ko",
    status: "failed",
    lastEventSeq: 3,
    createdAt: "2026-09-03T08:00:00.000Z",
  },
];

export const HOME_PREVIEW_RESEARCH_ROOM: LandingResearchRoomPreviewData = {
  reports: [
    {
      reportId: "00000000-0000-4000-8000-000000000101",
      symbol: "NVDA",
      question: "데이터센터 수요 둔화가 와도 마진을 지킬 수 있을까?",
      locale: "ko",
      researchTarget: { kind: "committee" },
      publishedAt: "2026-09-06T02:20:00.000Z",
      status: "complete",
      locked: false,
      viewCount: 214,
    },
    {
      reportId: "00000000-0000-4000-8000-000000000102",
      symbol: "TSLA",
      question: "에너지 사업이 자동차 마진 압박을 상쇄할 수 있는가?",
      locale: "ko",
      researchTarget: { kind: "department", departmentId: "financial" },
      publishedAt: "2026-09-05T21:40:00.000Z",
      status: "complete",
      locked: true,
      viewCount: 158,
    },
    {
      reportId: "00000000-0000-4000-8000-000000000103",
      symbol: "MSFT",
      question: "코파일럿 매출은 언제부터 숫자로 증명되나?",
      locale: "ko",
      researchTarget: { kind: "committee" },
      publishedAt: "2026-09-05T12:10:00.000Z",
      status: "complete_with_limitations",
      locked: true,
      viewCount: 96,
    },
    {
      reportId: "00000000-0000-4000-8000-000000000104",
      symbol: "MU",
      question: "HBM 증설 경쟁에서 수익성을 지킬 수 있을까?",
      locale: "ko",
      researchTarget: { kind: "department", departmentId: "market" },
      publishedAt: "2026-09-04T09:00:00.000Z",
      status: "complete",
      locked: true,
      viewCount: 73,
    },
    {
      reportId: "00000000-0000-4000-8000-000000000105",
      symbol: "AAPL",
      question: "서비스 성장만으로 밸류에이션을 방어할 수 있는가?",
      locale: "ko",
      researchTarget: { kind: "committee" },
      publishedAt: "2026-09-03T18:30:00.000Z",
      status: "complete",
      locked: true,
      viewCount: 61,
    },
  ],
  companyNames: LANDING_COMPANY_NAME_FALLBACKS,
};

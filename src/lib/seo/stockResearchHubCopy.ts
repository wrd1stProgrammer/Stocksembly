import type { Locale } from "../i18n";

type StockResearchHubCopy = Readonly<{
  eyebrow: string;
  title: (company: string, symbol: string) => string;
  description: (company: string, symbol: string) => string;
  reportCount: (count: number) => string;
  disclosureTitle: string;
  disclosure: string;
  archiveEyebrow: string;
  archiveTitle: string;
  archiveDescription: string;
  scope: Readonly<
    Record<"committee" | "market" | "company" | "financial" | "risk", string>
  >;
  limitationStatus: string;
  completeStatus: string;
  readReport: string;
  closingTitle: string;
  closingDescription: string;
  startResearch: string;
  browseArchive: string;
}>;

export const stockResearchHubCopy = {
  ko: {
    eyebrow: "미국주식 리서치 아카이브",
    title: (company, symbol) => `${company}(${symbol}) 미국주식 분석`,
    description: (company, symbol) =>
      `${company}(${symbol})를 기업, 재무, 시장, 리스크 관점에서 분석한 Stocksembly 공개 리서치를 모았습니다. 각 리서치는 여러 AI 전문팀의 조사와 독립 의장의 종합 판단을 거칩니다.`,
    reportCount: (count) => `공개 리서치 ${count}건`,
    disclosureTitle: "공개 기준",
    disclosure:
      "이 페이지에는 발행 후 7일이 지나 무료 열람과 검색 노출이 허용된 리서치만 표시됩니다. 최신 멤버 전용 리서치의 제목이나 내용은 포함하지 않습니다.",
    archiveEyebrow: "공개 리서치",
    archiveTitle: "검증 가능한 분석 기록",
    archiveDescription:
      "관심 질문과 분석 범위를 확인한 뒤 전체 리서치에서 근거, 한계, 최종 판단을 살펴보세요.",
    scope: {
      committee: "전체 팀 종합 리서치",
      market: "시장 분석팀",
      company: "기업 분석팀",
      financial: "재무 분석팀",
      risk: "리스크 분석팀",
    },
    limitationStatus: "한계 고지 포함",
    completeStatus: "분석 완료",
    readReport: "전체 리서치 읽기",
    closingTitle: "다른 미국주식도 같은 기준으로 분석해 보세요.",
    closingDescription:
      "분석 기간, 관점, 깊이, 비교 기업을 설정하고 팀 단위 또는 전문팀 단위 리서치를 시작할 수 있습니다.",
    startResearch: "새 리서치 시작",
    browseArchive: "전체 리서치룸 보기",
  },
  en: {
    eyebrow: "US stock research archive",
    title: (company, symbol) => `${company} (${symbol}) Stock Analysis`,
    description: (company, symbol) =>
      `Explore Stocksembly's public research on ${company} (${symbol}) across company, financial, market, and risk perspectives. Each report combines specialist AI-team work with an independent chair's synthesis.`,
    reportCount: (count) =>
      `${count} public ${count === 1 ? "report" : "reports"}`,
    disclosureTitle: "Publication standard",
    disclosure:
      "This page lists only reports whose seven-day member window has ended and which are eligible for free reading and search indexing. It exposes no title or content from recent member-only research.",
    archiveEyebrow: "Public research",
    archiveTitle: "An inspectable analysis record",
    archiveDescription:
      "Review the research question and scope, then open the full report for its evidence, limitations, and final judgment.",
    scope: {
      committee: "Full-team research",
      market: "Market team",
      company: "Company team",
      financial: "Financial team",
      risk: "Risk team",
    },
    limitationStatus: "Includes limitations",
    completeStatus: "Analysis complete",
    readReport: "Read full research",
    closingTitle: "Research another US stock with the same process.",
    closingDescription:
      "Set the time horizon, perspective, depth, and comparison companies, then start full-team or specialist-team research.",
    startResearch: "Start new research",
    browseArchive: "Browse Research Room",
  },
} satisfies Record<Locale, StockResearchHubCopy>;

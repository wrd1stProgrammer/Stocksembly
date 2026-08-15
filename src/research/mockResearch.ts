import type { ResearchLocale } from "../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type {
  AgentProfile,
  ResearchCompany,
  ResearchEvent,
  ResearchPhase,
} from "./types";

// allow: SIZE_OK — immutable bilingual research fixtures are a pure data table.
const localized = (
  en: string,
  ko: string,
): Readonly<Record<ResearchLocale, string>> => ({
  en,
  ko,
});

export const agents: readonly AgentProfile[] = OFFICE_SCENE_MANIFEST.roster.map(
  (member) => ({
    id: member.id,
    departmentId: member.departmentId,
    representative: member.representative,
    name: member.name,
    role: member.role,
    specialty: member.specialty,
    image: `/research/office-v7/portraits/${member.id}.png`,
    spriteSheet: `/research/office-v7/agents/${member.id}.png`,
  }),
);

export const initialResearchEvent: ResearchEvent = {
  id: "brief",
  phase: "briefing",
  agent: "chair",
  summary: localized("Research mandate issued", "리서치 과업을 배정했습니다"),
  detail: localized(
    "Build a balanced, source-linked view before the committee meets.",
    "위원회 전까지 출처가 연결된 균형 잡힌 관점을 준비합니다.",
  ),
  progress: 5,
};

export const researchEvents: readonly ResearchEvent[] = [
  initialResearchEvent,
  {
    id: "market",
    phase: "collecting",
    agent: "market",
    summary: localized("Scanning market regime", "시장 환경을 탐색 중입니다"),
    detail: localized(
      "AI infrastructure demand remains firm while rate sensitivity is rising.",
      "AI 인프라 수요는 견조하지만 금리 민감도는 높아지고 있습니다.",
    ),
    source: "Reuters · 10-K",
    progress: 42,
  },
  {
    id: "company",
    phase: "collecting",
    agent: "company",
    summary: localized(
      "Mapping the competitive moat",
      "경쟁우위를 구조화하고 있습니다",
    ),
    detail: localized(
      "CUDA adoption and the developer ecosystem reinforce switching costs.",
      "CUDA 채택과 개발자 생태계가 전환 비용을 강화합니다.",
    ),
    source: "Company filings",
    progress: 42,
  },
  {
    id: "financial",
    phase: "collecting",
    agent: "financial",
    summary: localized(
      "Normalizing earnings quality",
      "이익의 질을 정규화하고 있습니다",
    ),
    detail: localized(
      "Growth is broad, but customer concentration deserves monitoring.",
      "성장은 폭넓지만 고객 집중도는 계속 관찰해야 합니다.",
    ),
    source: "10-Q · Earnings call",
    progress: 42,
  },
  {
    id: "valuation",
    phase: "collecting",
    agent: "valuation",
    summary: localized(
      "Building valuation scenarios",
      "가치평가 시나리오를 만들고 있습니다",
    ),
    detail: localized(
      "The current multiple prices in sustained execution; expectations matter more now.",
      "현재 배수는 지속적인 실행을 반영해 기대치 관리가 더 중요합니다.",
    ),
    source: "SEC XBRL · Nasdaq",
    progress: 42,
  },
  {
    id: "benchmark",
    phase: "collecting",
    agent: "benchmark",
    summary: localized(
      "Testing the stock against benchmarks",
      "벤치마크와 교차자산을 비교 중입니다",
    ),
    detail: localized(
      "Sector peers, the semiconductor index, Treasury yields, and rate beta are being compared on the same evidence cutoff.",
      "동종기업·반도체 지수·미 국채 금리·금리 베타를 같은 근거 시점에서 비교합니다.",
    ),
    source: "InsightSentry · Treasury",
    progress: 42,
  },
  {
    id: "risk",
    phase: "collecting",
    agent: "risk",
    summary: localized(
      "Challenging the base case",
      "기본 시나리오를 반박 중입니다",
    ),
    detail: localized(
      "Export controls and hyperscaler capex digestion could compress the upside case.",
      "수출 통제와 하이퍼스케일러 투자 소화가 상승 시나리오를 제약할 수 있습니다.",
    ),
    source: "BIS · Company filings",
    progress: 42,
  },
  {
    id: "audit",
    phase: "analyzing",
    agent: "chair",
    summary: localized(
      "Auditing evidence coverage",
      "근거 범위를 감사하고 있습니다",
    ),
    detail: localized(
      "19 of 22 material claims are linked; three remain explicitly uncertain.",
      "핵심 주장 22개 중 19개가 출처와 연결됐고 3개는 불확실성으로 남겼습니다.",
    ),
    progress: 68,
  },
  {
    id: "gathering",
    phase: "gathering",
    agent: "chair",
    summary: localized(
      "Representatives are gathering",
      "대표들이 모이는 중입니다",
    ),
    detail: localized(
      "Four department summaries are ready for public cross-examination.",
      "네 개 부서 요약이 공개 상호 검증을 위해 준비됐습니다.",
    ),
    participantIds: ["market", "company", "financial", "risk", "chair"],
    progress: 78,
  },
  {
    id: "bull",
    phase: "committee",
    agent: "company",
    participantIds: ["company", "risk", "market", "financial"],
    summary: localized(
      "Bull thesis met its counterargument",
      "강세 주장과 반론을 함께 검토했습니다",
    ),
    detail: localized(
      "Ethan argued that platform depth protects pricing power; Liam countered that the expectation bar leaves little room for a slower transition. Maya and Noah tested both claims against the cycle and margins.",
      "이든은 플랫폼 깊이가 가격 결정력을 지킨다고 주장했고, 리암은 높은 기대 수준이 제품 전환 둔화를 허용하지 않는다고 반박했습니다. 마야와 노아는 사이클과 마진 근거로 두 주장을 함께 검증했습니다.",
    ),
    progress: 92,
  },
  {
    id: "complete",
    phase: "complete",
    agent: "chair",
    participantIds: ["chair", "market", "company", "financial", "risk"],
    summary: localized("Research file assembled", "리서치 파일을 완성했습니다"),
    detail: localized(
      "The committee preserved disagreement and marked every open question.",
      "위원회는 이견을 보존하고 모든 미해결 질문을 표시했습니다.",
    ),
    progress: 100,
  },
] as const;

const prices: Readonly<Record<string, readonly [string, string]>> = {
  NVDA: ["$181.46", "+1.82%"],
  AAPL: ["$254.12", "+0.64%"],
  MSFT: ["$511.72", "+0.91%"],
  TSLA: ["$472.18", "−1.24%"],
  AMZN: ["$232.94", "+0.38%"],
};

export function makeResearchCompany(
  symbol: string,
  company: string,
  exchange: string,
  sector: string,
): ResearchCompany {
  const market = prices[symbol] ?? ["$—", "0.00%"];
  return {
    symbol,
    company,
    exchange,
    sector,
    price: market[0],
    change: market[1],
    marketStatus: localized(
      "Market closed · Public snapshot",
      "장 마감 · 공개 스냅샷",
    ),
  };
}

export const phaseLabels: Readonly<
  Record<ResearchPhase, Readonly<Record<ResearchLocale, string>>>
> = {
  briefing: localized("Briefing", "브리핑"),
  collecting: localized("Collecting", "자료 수집"),
  analyzing: localized("Analyzing", "분석"),
  challenging: localized("Red-team", "반론"),
  auditing: localized("Evidence audit", "근거 감사"),
  gathering: localized("Gathering", "회의실 집결"),
  committee: localized("Committee", "투자 위원회"),
  complete: localized("Complete", "완료"),
};

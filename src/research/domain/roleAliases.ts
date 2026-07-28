import type { WorkflowRoleId } from "./roleRegistry";

export const WORKFLOW_V1_ROLE_ALIASES = {
  market: ["market", "Maya", "마야", "Market Lead", "시장 책임"],
  market_news: ["market_news", "June", "준", "News & Macro", "뉴스·거시"],
  benchmark: [
    "benchmark",
    "Alex",
    "알렉스",
    "Benchmark & Cross-Asset",
    "벤치마크·크로스에셋",
  ],
  company: ["company", "Ethan", "이든", "Company Lead", "기업 책임"],
  company_product: [
    "company_product",
    "Aria",
    "아리아",
    "Product Analyst",
    "제품 분석가",
  ],
  company_competition: [
    "company_competition",
    "Leo",
    "레오",
    "Competitive Intelligence",
    "경쟁 정보",
  ],
  financial: ["financial", "Noah", "노아", "Financial Lead", "재무 책임"],
  valuation: [
    "valuation",
    "Sofia",
    "소피아",
    "Valuation & Chart",
    "가치평가·차트",
  ],
  financial_quality: [
    "financial_quality",
    "Hana",
    "하나",
    "Earnings Quality",
    "이익의 질",
  ],
  risk: ["risk", "Liam", "리암", "Risk Lead", "리스크 책임"],
  risk_policy: [
    "risk_policy",
    "Min",
    "민",
    "Policy & Scenario",
    "정책·시나리오",
  ],
  chair: ["chair", "Dr. Park", "박 의장", "Research Chair", "리서치 의장"],
} as const satisfies Readonly<Record<WorkflowRoleId, readonly string[]>>;

export const WORKFLOW_V1_ATTRIBUTION_ALIASES = {
  market: ["Maya", "마야"],
  market_news: ["market_news", "June", "준"],
  benchmark: ["Alex", "알렉스"],
  company: ["Ethan", "이든"],
  company_product: ["company_product", "Aria", "아리아"],
  company_competition: ["company_competition", "Leo", "레오"],
  financial: ["Noah", "노아"],
  valuation: ["Sofia", "소피아"],
  financial_quality: ["financial_quality", "Hana", "하나"],
  risk: ["Liam", "리암"],
  risk_policy: ["risk_policy", "Min", "민"],
  chair: ["Dr. Park", "박 의장"],
} as const satisfies Readonly<Record<WorkflowRoleId, readonly string[]>>;

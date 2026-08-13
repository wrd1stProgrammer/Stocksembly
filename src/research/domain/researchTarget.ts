import { z } from "zod";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  type WorkflowDepartmentId,
} from "./roleRegistry";

export const ResearchDepartmentIdSchema = z.enum(WORKFLOW_V1_DEPARTMENT_IDS);

export const ResearchTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("committee") }).strict(),
  z
    .object({
      kind: z.literal("department"),
      departmentId: ResearchDepartmentIdSchema,
    })
    .strict(),
]);

export type ResearchTarget = z.infer<typeof ResearchTargetSchema>;

export const COMMITTEE_RESEARCH_TARGET: ResearchTarget = Object.freeze({
  kind: "committee",
});

const ResearchTargetQueryValueSchema = z.enum([
  "committee",
  ...WORKFLOW_V1_DEPARTMENT_IDS,
]);

export function researchTargetQueryValue(
  target: ResearchTarget,
): "committee" | WorkflowDepartmentId {
  return target.kind === "committee" ? "committee" : target.departmentId;
}

export function researchTargetFromQuery(value: unknown): ResearchTarget {
  const parsed = ResearchTargetQueryValueSchema.safeParse(value);
  if (!parsed.success || parsed.data === "committee")
    return COMMITTEE_RESEARCH_TARGET;
  return { kind: "department", departmentId: parsed.data };
}

export const RESEARCH_DEPARTMENT_COPY = {
  market: {
    en: "Market team",
    ko: "시장 분석팀",
    shortEn: "Market",
    shortKo: "시장",
  },
  company: {
    en: "Company team",
    ko: "기업 분석팀",
    shortEn: "Company",
    shortKo: "기업",
  },
  financial: {
    en: "Financial team",
    ko: "재무 분석팀",
    shortEn: "Financial",
    shortKo: "재무",
  },
  risk: {
    en: "Risk team",
    ko: "리스크 분석팀",
    shortEn: "Risk",
    shortKo: "리스크",
  },
} as const satisfies Record<
  WorkflowDepartmentId,
  {
    readonly en: string;
    readonly ko: string;
    readonly shortEn: string;
    readonly shortKo: string;
  }
>;

const SIGNALS = {
  market: [
    "market",
    "industry",
    "sector",
    "macro",
    "rate",
    "rates",
    "inflation",
    "demand",
    "tam",
    "trend",
    "momentum",
    "technical",
    "시장",
    "산업",
    "섹터",
    "거시",
    "금리",
    "인플레",
    "수요",
    "추세",
    "모멘텀",
    "기술적",
  ],
  company: [
    "business",
    "product",
    "products",
    "customer",
    "customers",
    "competition",
    "competitor",
    "moat",
    "strategy",
    "execution",
    "roadmap",
    "share",
    "사업",
    "제품",
    "고객",
    "경쟁",
    "해자",
    "전략",
    "실행력",
    "로드맵",
    "점유율",
  ],
  financial: [
    "revenue",
    "revenues",
    "earnings",
    "profit",
    "profits",
    "margin",
    "margins",
    "cash flow",
    "cashflow",
    "balance sheet",
    "valuation",
    "multiple",
    "per",
    "p/e",
    "eps",
    "매출",
    "실적",
    "이익",
    "마진",
    "현금흐름",
    "재무",
    "밸류에이션",
    "가치평가",
  ],
  risk: [
    "risk",
    "risks",
    "downside",
    "regulation",
    "policy",
    "lawsuit",
    "scenario",
    "invalidate",
    "bear case",
    "리스크",
    "하방",
    "규제",
    "정책",
    "소송",
    "시나리오",
    "무효화",
    "실패",
  ],
} as const satisfies Record<WorkflowDepartmentId, readonly string[]>;

const REASONS = {
  market: {
    en: "This question is centered on industry, demand, macro conditions, or market signals.",
    ko: "산업·수요·거시환경·시장 신호를 중심으로 검증하는 질문입니다.",
  },
  company: {
    en: "This question is centered on products, competition, strategy, or execution.",
    ko: "제품·경쟁력·전략·실행력을 중심으로 검증하는 질문입니다.",
  },
  financial: {
    en: "This question is centered on earnings, margins, cash flow, or valuation.",
    ko: "실적·마진·현금흐름·밸류에이션을 중심으로 검증하는 질문입니다.",
  },
  risk: {
    en: "This question is centered on downside, regulation, or invalidation conditions.",
    ko: "하방 위험·규제·판단 무효화 조건을 중심으로 검증하는 질문입니다.",
  },
  committee: {
    en: "This question spans several research disciplines, so the full committee is the safer default.",
    ko: "여러 분석 영역에 걸친 질문이라 전체 위원회 검토가 더 적합합니다.",
  },
} as const;

export type ResearchTargetRecommendation = {
  readonly target: ResearchTarget;
  readonly confidence: "high" | "balanced";
  readonly reason: { readonly en: string; readonly ko: string };
  readonly scores: Readonly<Record<WorkflowDepartmentId, number>>;
};

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesSignal(value: string, signal: string): boolean {
  if (/[^\p{ASCII}]/u.test(signal)) return value.includes(signal);
  const escaped = signal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
    "u",
  ).test(value);
}

export function recommendResearchTarget(
  question: string,
): ResearchTargetRecommendation {
  const value = normalized(question);
  const scores = Object.fromEntries(
    WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId) => [
      departmentId,
      SIGNALS[departmentId].reduce(
        (score, signal) => score + (matchesSignal(value, signal) ? 1 : 0),
        0,
      ),
    ]),
  ) as Record<WorkflowDepartmentId, number>;
  const ranked = WORKFLOW_V1_DEPARTMENT_IDS.map((departmentId) => ({
    departmentId,
    score: scores[departmentId],
  })).sort((left, right) => right.score - left.score);
  const first = ranked[0];
  const second = ranked[1];
  if (
    first === undefined ||
    first.score === 0 ||
    (second !== undefined && second.score > 0 && first.score - second.score < 2)
  ) {
    return {
      target: COMMITTEE_RESEARCH_TARGET,
      confidence: "balanced",
      reason: REASONS.committee,
      scores,
    };
  }
  return {
    target: { kind: "department", departmentId: first.departmentId },
    confidence: "high",
    reason: REASONS[first.departmentId],
    scores,
  };
}

export function researchTargetKey(target: ResearchTarget): string {
  return target.kind === "committee"
    ? "committee"
    : `department:${target.departmentId}`;
}

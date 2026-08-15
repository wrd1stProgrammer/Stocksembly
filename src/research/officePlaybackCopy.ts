import type { ResearchLocale } from "../lib/i18n";
import type { OfficeBeatId } from "./officeChoreography";

export type OfficePlaybackCopy = {
  readonly summary: Readonly<Record<ResearchLocale, string>>;
  readonly detail: Readonly<Record<ResearchLocale, string>>;
  readonly source?: string;
};

const localized = (en: string, ko: string) => ({ en, ko });
const copy = (
  summaryEn: string,
  summaryKo: string,
  detailEn: string,
  detailKo: string,
  source?: string,
): OfficePlaybackCopy => ({
  summary: localized(summaryEn, summaryKo),
  detail: localized(detailEn, detailKo),
  ...(source ? { source } : {}),
});

const PUBLIC_COPY: Readonly<Record<string, OfficePlaybackCopy>> = {
  mandate: copy(
    "Research mandate issued",
    "리서치 과업을 배정했습니다",
    "The chair set a source-linked brief for four departments.",
    "의장이 네 개 부서에 출처 연결 과업을 배정했습니다.",
  ),
  "work-progress-80": copy(
    "Four departments are working in parallel",
    "네 개 부서가 동시에 조사 중입니다",
    "Market, company, financial, and risk desks are collecting public evidence.",
    "시장·기업·재무·리스크 데스크가 공개 근거를 수집하고 있습니다.",
    "Reuters · filings",
  ),
  "work-progress-140": copy(
    "Cross-checks are in progress",
    "상호 검증을 진행 중입니다",
    "Each department is testing its work against the public record.",
    "각 부서가 공개 기록을 기준으로 조사 결과를 검증합니다.",
    "SEC filings · macro data",
  ),
  "work-progress-200": copy(
    "Department checkpoints are taking shape",
    "부서별 체크포인트를 정리 중입니다",
    "Specialists keep only claims that can be linked to a source.",
    "전문가들은 출처에 연결할 수 있는 주장만 남깁니다.",
    "Company filings · earnings call",
  ),
  "checkpoint-market": copy(
    "Market checkpoint published",
    "시장 체크포인트를 공개했습니다",
    "Macro regime and sentiment evidence are ready for challenge.",
    "거시 국면과 심리 근거를 반론 세션에 넘겼습니다.",
    "Reuters · market data",
  ),
  "checkpoint-company": copy(
    "Company checkpoint published",
    "기업 체크포인트를 공개했습니다",
    "Product adoption and competition evidence are linked.",
    "제품 채택과 경쟁 구도 근거를 연결했습니다.",
    "10-K · product filings",
  ),
  "checkpoint-financial": copy(
    "Financial checkpoint published",
    "재무 체크포인트를 공개했습니다",
    "Earnings quality and valuation scenarios are linked.",
    "이익의 질과 가치평가 시나리오를 연결했습니다.",
    "10-Q · XBRL",
  ),
  "checkpoint-risk": copy(
    "Risk checkpoint published",
    "리스크 체크포인트를 공개했습니다",
    "Policy shocks and downside scenarios are linked.",
    "정책 충격과 하방 시나리오를 연결했습니다.",
    "BIS · filings",
  ),
  "representatives-gathering": copy(
    "Representatives are gathering",
    "대표들이 모이는 중입니다",
    "Only four department representatives and Dr. Park leave their desks.",
    "네 부서 대표와 박 의장만 자리를 떠납니다.",
  ),
  "chair-synthesis": copy(
    "Chair synthesis recorded",
    "의장 종합을 기록했습니다",
    "The chair preserves agreement, counter-evidence, and open questions.",
    "의장이 합의와 반대 근거, 미해결 질문을 보존합니다.",
    "Public evidence ledger",
  ),
  complete: copy(
    "Research file assembled",
    "리서치 파일을 완성했습니다",
    "The public ledger preserves support, counter-evidence, and open questions.",
    "공개 원장이 지지 근거와 반대 근거, 미해결 질문을 보존합니다.",
    "Public evidence ledger",
  ),
};

function publicCopy(id: string): OfficePlaybackCopy {
  const result = PUBLIC_COPY[id];
  if (!result) throw new RangeError(`Missing public copy ${id}`);
  return result;
}

export const OFFICE_BEAT_COPY: Readonly<
  Record<OfficeBeatId, OfficePlaybackCopy>
> = {
  briefing: publicCopy("mandate"),
  "parallel-work": publicCopy("work-progress-80"),
  "department-talk": copy(
    "Departments are comparing notes",
    "부서가 서로의 메모를 비교 중입니다",
    "Representatives and specialists face one another at their department anchors.",
    "대표와 전문가가 부서 대화 앵커에서 서로 마주 보고 있습니다.",
  ),
  "visit-wave-a": copy(
    "First evidence handoffs are underway",
    "첫 번째 근거 교환을 진행 중입니다",
    "Market visits company and financial visits risk while home desks keep working.",
    "시장 대표는 기업으로, 재무 대표는 리스크로 이동하고 나머지는 각 자리에서 일합니다.",
    "Linked public evidence",
  ),
  "return-a": copy(
    "First visitors are returning",
    "첫 번째 방문 대표가 돌아오는 중입니다",
    "Two representatives return with public handoff summaries.",
    "두 대표가 공개 근거 교환 요약을 들고 돌아옵니다.",
  ),
  "visit-wave-b": copy(
    "Second evidence handoffs are underway",
    "두 번째 근거 교환을 진행 중입니다",
    "Company visits financial and risk visits market for a second challenge.",
    "기업 대표는 재무로, 리스크 대표는 시장으로 이동해 두 번째 반론을 엽니다.",
    "Counter-evidence ledger",
  ),
  "return-b": copy(
    "All departments are ready",
    "네 개 부서가 모두 준비됐습니다",
    "Every department has published a source-linked summary.",
    "모든 부서가 출처 연결 요약을 공개했습니다.",
  ),
  "representative-gathering": publicCopy("representatives-gathering"),
  forum: copy(
    "The public forum is in session",
    "공개 포럼을 진행 중입니다",
    "Representatives present their department evidence while the chair tracks open questions.",
    "대표들이 부서 근거를 발표하고 의장이 미해결 질문을 기록합니다.",
  ),
  complete: publicCopy("complete"),
};

const EVENT_COPY = {
  handoff: copy(
    "Evidence handoff recorded",
    "근거 교환을 기록했습니다",
    "A department challenge was added to the public ledger.",
    "부서 간 반론을 공개 원장에 추가했습니다.",
    "Public evidence ledger",
  ),
  return: copy(
    "Visitor summary published",
    "방문 요약을 공개했습니다",
    "A representative returned with a source-linked summary.",
    "대표가 출처 연결 요약을 들고 돌아왔습니다.",
    "Public evidence ledger",
  ),
  ready: copy(
    "Department summary ready",
    "부서 요약을 준비했습니다",
    "A department has published its source-linked checkpoint.",
    "부서가 출처 연결 체크포인트를 공개했습니다.",
    "Public evidence ledger",
  ),
  present: copy(
    "Department presentation recorded",
    "부서 발표를 기록했습니다",
    "A representative presented public evidence to the chair.",
    "대표가 의장에게 공개 근거를 발표했습니다.",
    "Public evidence ledger",
  ),
  default: copy(
    "Public checkpoint recorded",
    "공개 체크포인트를 기록했습니다",
    "A source-linked event was added to the public evidence ledger.",
    "출처 연결 이벤트를 공개 근거 원장에 추가했습니다.",
    "Public evidence ledger",
  ),
} as const;

export function officeEventCopy(id: string): OfficePlaybackCopy {
  const direct = PUBLIC_COPY[id];
  if (direct) return direct;
  const category = id.startsWith("handoff-")
    ? "handoff"
    : id.startsWith("return-")
      ? "return"
      : id.startsWith("ready-")
        ? "ready"
        : id.startsWith("present-")
          ? "present"
          : "default";
  return EVENT_COPY[category];
}

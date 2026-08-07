import type { PublicResearchEvent, PublicRunDetail } from "./client/schemas";
import { WORKFLOW_V1_ROLE_REGISTRY } from "./domain/roleRegistry";
import type { AgentId, ResearchEvent, ResearchPhase } from "./types";

const ACTOR_IDS = new Set<AgentId>([
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
]);

const KO_KIND_LABELS: Readonly<Record<PublicResearchEvent["kind"], string>> = {
  run_created: "리서치 실행 생성",
  collection_started: "공식 근거 수집 시작",
  evidence_cutoff_recorded: "근거 기준시각 확정",
  snapshot_sealed: "근거 스냅샷 봉인",
  mandate_sealed: "에이전트 과업 확정",
  specialist_memo_committed: "전문 에이전트 메모 커밋",
  department_consolidation_committed: "부서 종합 의견 커밋",
  challenge_committed: "반론 커밋",
  followup_committed: "후속 조사 커밋",
  owner_response_committed: "담당 부서 답변 커밋",
  department_ballot_committed: "부서 투표 커밋",
  structural_audit_completed: "구조 감사 완료",
  semantic_audit_committed: "의미 감사 커밋",
  gathering_started: "위원회 소집 시작",
  committee_classified: "위원회 판단 확정",
  chair_synthesis_committed: "리서치 의장 종합 커밋",
  runtime_status: "리서치 복구 상태 변경",
  report_published: "리서치 보고서 발행",
  run_incomplete: "리서치 미완료 종료",
  run_failed: "리서치 실행 실패",
  run_cancelling: "리서치 취소 중",
  run_cancelled: "리서치 취소 완료",
};

const RUNTIME_STATUS_SUMMARIES: Readonly<
  Record<string, { readonly en: string; readonly ko: string }>
> = {
  waiting: {
    en: "Waiting for the next durable retry",
    ko: "다음 영속 재시도를 기다리고 있습니다",
  },
  retrying: {
    en: "Retrying the interrupted research stage",
    ko: "중단된 리서치 단계를 다시 시도하고 있습니다",
  },
  "blocked-external-dependency": {
    en: "External dependency needs operator attention",
    ko: "외부 의존성에 운영자 확인이 필요합니다",
  },
  "invalid-model-output": {
    en: "Model output was invalid and remains repairable",
    ko: "모델 출력이 유효하지 않아 복구 대기 중입니다",
  },
  "publication-failure": {
    en: "Report publication failed after synthesis",
    ko: "종합 이후 보고서 발행에 실패했습니다",
  },
  "attention-required": {
    en: "Research is paused for operator attention",
    ko: "운영자 확인을 위해 리서치가 일시 중지되었습니다",
  },
};

function actorId(value: string | undefined): AgentId {
  return value !== undefined && ACTOR_IDS.has(value as AgentId)
    ? (value as AgentId)
    : "chair";
}

function phaseFor(kind: PublicResearchEvent["kind"]): ResearchPhase {
  if (
    ["run_created", "collection_started", "evidence_cutoff_recorded"].includes(
      kind,
    )
  )
    return kind === "run_created" ? "briefing" : "collecting";
  if (
    [
      "snapshot_sealed",
      "mandate_sealed",
      "specialist_memo_committed",
      "department_consolidation_committed",
    ].includes(kind)
  )
    return "analyzing";
  if (
    [
      "challenge_committed",
      "followup_committed",
      "owner_response_committed",
      "department_ballot_committed",
    ].includes(kind)
  )
    return "challenging";
  if (["structural_audit_completed", "semantic_audit_committed"].includes(kind))
    return "auditing";
  if (kind === "gathering_started") return "gathering";
  if (kind === "committee_classified") return "committee";
  if (kind === "runtime_status") return "analyzing";
  if (kind === "report_published") return "complete";
  return kind === "chair_synthesis_committed" ? "committee" : "auditing";
}

function progressTick(
  event: PublicResearchEvent,
  events: readonly PublicResearchEvent[],
): number {
  const count = (kind: PublicResearchEvent["kind"]) =>
    events.filter((item) => item.kind === kind).length;
  switch (event.kind) {
    case "run_created":
      return 0;
    case "collection_started":
      return 30;
    case "evidence_cutoff_recorded":
      return 80;
    case "snapshot_sealed":
      return 160;
    case "mandate_sealed":
      return 220;
    case "specialist_memo_committed":
      return Math.min(570, 220 + count(event.kind) * 35);
    case "department_consolidation_committed":
      return Math.min(720, 580 + count(event.kind) * 35);
    case "challenge_committed":
      return Math.min(880, 720 + count(event.kind) * 40);
    case "followup_committed":
      return Math.min(1_010, 900 + count(event.kind) * 35);
    case "owner_response_committed":
    case "department_ballot_committed":
      return Math.min(1_180, 1_020 + count(event.kind) * 30);
    case "structural_audit_completed":
      return 1_250;
    case "semantic_audit_committed":
      return 1_330;
    case "gathering_started":
      return 1_390;
    case "committee_classified":
      return 1_450;
    case "chair_synthesis_committed":
      return 1_520;
    case "runtime_status":
      return Math.min(1_510, event.sequence * 20);
    case "report_published":
      return 1_580;
    case "run_incomplete":
    case "run_failed":
    case "run_cancelling":
    case "run_cancelled":
      return Math.min(1_570, event.sequence * 20);
  }
}

function summaryFor(event: PublicResearchEvent) {
  if (event.kind === "runtime_status") {
    const runtimeSummary = RUNTIME_STATUS_SUMMARIES[event.stateId];
    if (runtimeSummary !== undefined) return runtimeSummary;
  }
  if (
    event.summary !== undefined &&
    event.summary.en.trim().length > 0 &&
    event.summary.ko.trim().length > 0
  )
    return event.summary;
  const label = event.kind.replaceAll("_", " ");
  return {
    en: `${label[0]?.toUpperCase() ?? ""}${label.slice(1)}.`,
    ko: `${KO_KIND_LABELS[event.kind]}.`,
  };
}

const waitingSummary = {
  en: "Waiting for the next committed research event",
  ko: "다음 리서치 커밋 이벤트를 기다리고 있습니다",
} as const;

export function liveOfficeProjection(snapshot: PublicRunDetail): {
  readonly tick: number;
  readonly current: ResearchEvent;
  readonly events: readonly ResearchEvent[];
} {
  const defaultActor =
    snapshot.run.researchTarget?.kind === "department"
      ? WORKFLOW_V1_ROLE_REGISTRY.departments[
          snapshot.run.researchTarget.departmentId
        ].leadId
      : "chair";
  const collectionStartedSeen = new Set<string>();
  const visibleEvents = snapshot.events.filter((event, index) => {
    if (event.kind === "runtime_status")
      return index === snapshot.events.length - 1;
    if (event.kind !== "collection_started") return true;
    const summary = summaryFor(event);
    const fingerprint = `${event.actorId ?? "chair"}|${summary.en}|${summary.ko}`;
    if (collectionStartedSeen.has(fingerprint)) return false;
    collectionStartedSeen.add(fingerprint);
    return true;
  });
  const projected = visibleEvents.map((event) => {
    const summary = summaryFor(event);
    const tick = progressTick(event, visibleEvents);
    return {
      id: `durable-${event.sequence}`,
      phase: phaseFor(event.kind),
      agent: actorId(event.actorId ?? event.participantIds[0] ?? defaultActor),
      summary,
      detail: {
        en: `Committed event #${event.sequence} · ${event.kind.replaceAll("_", " ")}`,
        ko: `커밋 이벤트 #${event.sequence} · ${KO_KIND_LABELS[event.kind]}`,
      },
      progress: Math.round((tick / 1_580) * 100),
      tick,
      workflowKind: event.kind,
      participantIds: event.participantIds.filter((id): id is AgentId =>
        ACTOR_IDS.has(id as AgentId),
      ),
    } satisfies ResearchEvent;
  });
  const current =
    projected.at(-1) ??
    ({
      id: "durable-waiting",
      phase: "briefing",
      agent: defaultActor,
      summary: waitingSummary,
      detail: waitingSummary,
      progress: 0,
      tick: 0,
    } satisfies ResearchEvent);
  return Object.freeze({
    tick: current.tick ?? 0,
    current,
    events: Object.freeze(projected),
  });
}

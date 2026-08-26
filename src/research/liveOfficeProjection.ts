import type { PublicResearchEvent, PublicRunDetail } from "./client/schemas";
import { WORKFLOW_V1_ROLE_REGISTRY } from "./domain/roleRegistry";
import { OFFICE_DEPARTMENT_TALK_TIMELINE } from "./officeChoreography";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
} from "./officeSceneManifest";
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
  priorTick: number,
): number {
  const ordinal = events.filter(
    (item) => item.kind === event.kind && item.sequence <= event.sequence,
  ).length;
  let tick: number;
  switch (event.kind) {
    case "run_created":
      tick = 0;
      break;
    case "collection_started":
      tick = 30;
      break;
    case "evidence_cutoff_recorded":
      tick = 80;
      break;
    case "snapshot_sealed":
      tick = 160;
      break;
    case "mandate_sealed":
      tick = 220;
      break;
    case "specialist_memo_committed":
      tick = 220 + Math.min(19, ordinal);
      break;
    case "department_consolidation_committed":
      {
        const releaseOrder = departmentReleaseOrder(events, event.sequence);
        const departmentId = departmentForEvent(event);
        const departmentIndex =
          departmentId === undefined
            ? Math.max(0, ordinal - 1)
            : Math.max(0, releaseOrder.indexOf(departmentId));
        tick =
          OFFICE_DEPARTMENT_TALK_TIMELINE.firstReleaseTick +
          departmentIndex *
            OFFICE_DEPARTMENT_TALK_TIMELINE.releaseIntervalTicks +
          OFFICE_DEPARTMENT_TALK_TIMELINE.settledOffsetTicks;
      }
      break;
    case "challenge_committed":
    case "followup_committed":
      tick = 501;
      break;
    case "owner_response_committed":
      tick = 861;
      break;
    case "semantic_audit_committed":
      tick = 1_056;
      break;
    case "structural_audit_completed":
      tick = 1_261;
      break;
    case "gathering_started":
      tick = 1_261;
      break;
    case "department_ballot_committed":
      tick = Math.min(1_466, 1_301 + (ordinal - 1) * 55);
      break;
    case "committee_classified":
      tick = 1_521;
      break;
    case "chair_synthesis_committed":
      tick = 1_541;
      break;
    case "runtime_status":
      tick = priorTick;
      break;
    case "report_published":
      tick = 1_580;
      break;
    case "run_incomplete":
    case "run_failed":
    case "run_cancelling":
    case "run_cancelled":
      tick = priorTick;
      break;
  }
  return Math.max(priorTick, tick);
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

function departmentForEvent(
  event: PublicResearchEvent,
): OfficeDepartmentId | undefined {
  for (const actorId of [event.actorId, ...event.participantIds]) {
    const member = OFFICE_SCENE_MANIFEST.roster.find(
      (candidate) => candidate.id === actorId,
    );
    if (
      member !== undefined &&
      member.departmentId !== "chair" &&
      Object.hasOwn(OFFICE_SCENE_MANIFEST.departments, member.departmentId)
    ) {
      return member.departmentId as OfficeDepartmentId;
    }
  }
  return undefined;
}

function departmentReleaseOrder(
  events: readonly PublicResearchEvent[],
  throughSequence = Number.POSITIVE_INFINITY,
): readonly OfficeDepartmentId[] {
  const seen = new Set<OfficeDepartmentId>();
  const order: OfficeDepartmentId[] = [];
  for (const event of events) {
    if (
      event.sequence > throughSequence ||
      event.kind !== "department_consolidation_committed"
    ) {
      continue;
    }
    const departmentId = departmentForEvent(event);
    if (departmentId === undefined || seen.has(departmentId)) continue;
    seen.add(departmentId);
    order.push(departmentId);
  }
  return Object.freeze(order);
}

export function liveOfficeProjection(snapshot: PublicRunDetail): {
  readonly tick: number;
  readonly current: ResearchEvent;
  readonly events: readonly ResearchEvent[];
  readonly departmentReleaseOrder: readonly OfficeDepartmentId[];
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
  const projected: ResearchEvent[] = [];
  for (const event of visibleEvents) {
    const summary = summaryFor(event);
    const tick = progressTick(
      event,
      visibleEvents,
      projected.at(-1)?.tick ?? 0,
    );
    projected.push({
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
    } satisfies ResearchEvent);
  }
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
    departmentReleaseOrder: departmentReleaseOrder(visibleEvents),
  });
}

import type { Locale } from "../../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { AgentId, ResearchDepartmentStatus } from "../../research/types";

export function fallbackDepartmentStatuses(
  activeAgentIds: readonly AgentId[],
  walkingAgentIds: readonly AgentId[],
  completedAgentIds: readonly AgentId[],
): readonly ResearchDepartmentStatus[] {
  const activeAgents = new Set(activeAgentIds);
  const walkingAgents = new Set(walkingAgentIds);
  const completedAgents = new Set(completedAgentIds);
  return Object.entries(OFFICE_SCENE_MANIFEST.departments).map(
    ([id, department]) =>
      Object.freeze({
        id: id as ResearchDepartmentStatus["id"],
        memberIds: department.memberIds,
        representativeId: department.representativeId,
        memberCount: department.memberIds.length,
        activeCount: department.memberIds.filter((memberId) =>
          activeAgents.has(memberId),
        ).length,
        walkingCount: department.memberIds.filter((memberId) =>
          walkingAgents.has(memberId),
        ).length,
        completeCount: department.memberIds.filter((memberId) =>
          completedAgents.has(memberId),
        ).length,
        status: "working" as const,
      }),
  );
}

export function departmentStatusLabel(
  status: ResearchDepartmentStatus["status"],
  locale: Locale,
): string {
  return locale === "ko"
    ? {
        briefing: "브리핑",
        working: "동시 조사",
        visiting: "근거 교환",
        ready: "요약 준비",
        forum: "대표 포럼",
      }[status]
    : {
        briefing: "Briefing",
        working: "Working in parallel",
        visiting: "Evidence handoff",
        ready: "Summary ready",
        forum: "Representative forum",
      }[status];
}

export function departmentLabel(id: string, locale: Locale): string {
  return locale === "ko"
    ? ({
        market: "시장",
        company: "기업",
        financial: "재무",
        risk: "리스크",
        chair: "의장",
      }[id] ?? id)
    : id.toUpperCase();
}

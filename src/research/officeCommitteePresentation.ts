import type { ResearchFileData } from "./compositions/types";
import type { ResearchEvent } from "./types";

export function officeTeamStatement(
  team: ResearchFileData["teamViews"][number],
) {
  return {
    en: [...new Set([team.position.en, team.rationale.en])]
      .filter(Boolean)
      .join(" "),
    ko: [...new Set([team.position.ko, team.rationale.ko])]
      .filter(Boolean)
      .join(" "),
  };
}

// Some workflows persist the final team positions only in the published report.
// Present those saved positions before the chair, without fabricating public commits.
export function officeCommitteePresentation(
  events: readonly ResearchEvent[],
  teamViews: ResearchFileData["teamViews"] | undefined,
): readonly ResearchEvent[] {
  if (
    events.some((event) => event.workflowKind === "department_ballot_committed")
  )
    return events;
  const closingIndex = events.findIndex((event) =>
    [
      "committee_classified",
      "chair_synthesis_committed",
      "report_published",
    ].includes(event.workflowKind ?? ""),
  );
  if (closingIndex < 0) return events;
  const before = events.slice(0, closingIndex);
  if (teamViews === undefined) return before;
  const presentations: ResearchEvent[] = teamViews.map((team, index) => ({
    id: `report-team-${team.departmentId}`,
    agent: team.representativeId,
    participantIds: [team.representativeId, "chair"],
    workflowKind: "committee_team_view",
    phase: "committee",
    progress: 85 + index * 2,
    tick: Math.max(before.at(-1)?.tick ?? 0, 1301 + index * 55),
    summary: officeTeamStatement(team),
    detail: {
      en: "Final team position and rationale from the saved report.",
      ko: "저장된 보고서의 팀별 최종 입장과 판단 근거입니다.",
    },
  }));
  return [...before, ...presentations, ...events.slice(closingIndex)];
}

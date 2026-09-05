import { expect, it } from "vitest";
import type { ResearchFileData } from "./compositions/types";
import { officeCommitteePresentation } from "./officeCommitteePresentation";
import type { ResearchEvent } from "./types";

it("presents all saved final team positions before the chair, without inventing findings or replaying ballots", () => {
  const gathering: ResearchEvent = {
    id: "gather",
    agent: "chair",
    phase: "gathering",
    workflowKind: "gathering_started",
    progress: 80,
    tick: 1261,
    summary: { en: "Gather", ko: "소집" },
    detail: { en: "", ko: "" },
  };
  const chair: ResearchEvent = {
    ...gathering,
    id: "chair",
    workflowKind: "chair_synthesis_committed",
    tick: 1541,
  };
  const teams: ResearchFileData["teamViews"] = (
    ["market", "company", "financial", "risk"] as const
  ).map((id) => ({
    departmentId: id,
    representativeId: id,
    teamName: { en: id, ko: id },
    vote: "support_with_reservations",
    position: { en: `${id} saved position.`, ko: `${id} 저장된 입장.` },
    rationale: { en: `${id} saved rationale.`, ko: `${id} 저장된 근거.` },
  }));
  expect(officeCommitteePresentation([gathering, chair], undefined)).toEqual([
    gathering,
  ]);
  const result = officeCommitteePresentation([gathering, chair], teams);
  expect(result.map((entry) => entry.agent)).toEqual([
    "chair",
    "market",
    "company",
    "financial",
    "risk",
    "chair",
  ]);
  expect(result[1]?.summary.en).toBe(
    "market saved position. market saved rationale.",
  );
  expect(
    result
      .slice(1, 5)
      .every((entry) => entry.workflowKind === "committee_team_view"),
  ).toBe(true);
  const ballot = { ...gathering, workflowKind: "department_ballot_committed" };
  expect(officeCommitteePresentation([ballot, chair], teams)).toEqual([
    ballot,
    chair,
  ]);
});

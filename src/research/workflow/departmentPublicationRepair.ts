import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import {
  DepartmentJobPromptSchema,
  type PersistedDepartmentJob,
} from "./departmentRoundContracts";
import { inspectDepartmentCandidate } from "./departmentRoundOutput";

/** Preserve authenticated member findings when the final synthesis is malformed.
 * This is a limited compilation, not a new evidence audit or consensus vote. */
export function repairDepartmentPublication(
  job: PersistedDepartmentJob,
  candidate: unknown,
) {
  const accepted = inspectDepartmentCandidate(job, candidate);
  if (accepted !== undefined) return accepted;
  const request = DepartmentJobPromptSchema.parse(JSON.parse(job.prompt));
  const positions = request.memberArtifacts.flatMap(
    (member) => member.memo.positions,
  );
  const lead = positions.find((position) => position.falsifier !== undefined);
  if (lead === undefined) return undefined;
  const supported = positions.filter(
    (position) => position.falsifier !== undefined,
  );
  const ids = supported.map((position) => position.claimId);
  const countercase = lead.strongestContraryObservation ?? {
    en: "Independent counterevidence remains unconfirmed; treat the retained findings as provisional.",
    ko: "독립적인 반대 근거가 아직 확인되지 않아 보존된 분석은 잠정적으로 판단해야 합니다.",
  };
  const reason = {
    en: "Retained from the authenticated specialist memo; final synthesis was incomplete and does not establish team consensus.",
    ko: "인증된 전문 분석에서 보존했습니다. 최종 종합이 불완전하여 팀 합의로 확정하지 않았습니다.",
  };
  const dimensions = new Set<string>();
  const representatives = supported
    .filter((position) => {
      const key =
        position.decisionDimension ?? position.roleOwner ?? position.claimId;
      if (dimensions.has(key)) return false;
      dimensions.add(key);
      return true;
    })
    .slice(0, 3);
  const summary = {
    en: `Final synthesis is limited. ${representatives.map((position) => position.publicSummary.en).join(" ")}`.slice(
      0,
      4000,
    ),
    ko: `최종 종합은 제한적입니다. ${representatives.map((position) => position.publicSummary.ko).join(" ")}`.slice(
      0,
      4000,
    ),
  };
  const repaired = DepartmentConsolidationOutputSchema.safeParse({
    kind: "department_consolidation",
    publicationMode: "limited_compilation",
    sourceArtifactIds: request.memberArtifacts.map(
      (member) => member.artifactId,
    ),
    agreementClaimIds: [],
    disagreementClaimIds: supported
      .filter((position) => position.stance === "opposes")
      .map((position) => position.claimId),
    acceptedClaimIds: ids,
    strongestClaimIds: [lead.claimId],
    weakestClaimIds: [ids.at(-1)!],
    revisedClaimIds: [],
    removedClaimIds: positions
      .filter((position) => !ids.includes(position.claimId))
      .map((position) => position.claimId),
    dispositions: positions.map((position) => ({
      claimId: position.claimId,
      disposition: ids.includes(position.claimId) ? "accept" : "remove",
      reason,
    })),
    revisions: [],
    publicSummary: summary,
    decisionPacket: {
      primaryClaimId: lead.claimId,
      stanceContribution: "uncertain",
      strongestCountercase: countercase,
      countercaseClaimIds: [lead.claimId],
      falsifier: lead.falsifier,
    },
    dissent: request.memberArtifacts
      .flatMap((member) => member.memo.dissent)
      .filter((item) => ids.includes(item.claimId)),
    openQuestions: [reason],
    evidencePriorityArtifactIds: [
      ...new Set(supported.flatMap((position) => position.evidenceArtifactIds)),
    ].slice(0, 64),
  });
  return repaired.success
    ? inspectDepartmentCandidate(job, repaired.data)
    : undefined;
}

import { z } from "zod";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type { DepartmentJobPrompt } from "./departmentRoundContracts";

const SpecialistPromptSchema = z.object({
  request: z
    .object({
      role: z.object({ id: z.enum(WORKFLOW_V1_SPECIALIST_IDS) }).passthrough(),
      ids: z.object({ claimId: z.string().uuid() }).passthrough(),
    })
    .passthrough(),
  sourceArtifactIds: z.array(z.string().uuid()).min(1),
});

export type DepartmentFault =
  | "none"
  | "uncited_number"
  | "new_claim"
  | "new_evidence"
  | "mistyped_dissent_claim"
  | "absent_member_speech"
  | "absent_role_id_speech"
  | "absent_korean_speech"
  | "qualitative_new_fact"
  | "qualitative_new_dissent"
  | "extra_open_question"
  | "source_backed_role_words"
  | "source_backed_issuer_report"
  | "absent_maya_speech"
  | "absent_maya_korean_speech";

function publicText(value: string) {
  return { en: `${value} finding`, ko: `${value} 결과` };
}

function financialFaultSummary(fault: DepartmentFault) {
  if (fault === "uncited_number")
    return { en: "Revenue rose 37 percent", ko: "매출이 37 퍼센트 증가" };
  if (fault === "absent_member_speech")
    return {
      en: "Aria said this is durable",
      ko: "Aria가 지속 가능하다고 말했다",
    };
  if (fault === "absent_role_id_speech")
    return {
      en: "company_product said this is durable",
      ko: "company_product가 지속 가능하다고 말했다",
    };
  if (fault === "absent_korean_speech")
    return {
      en: "This is durable",
      ko: "아리아가 말했다: 이것은 지속 가능하다",
    };
  if (fault === "absent_maya_speech")
    return { en: "Maya said this is durable", ko: "이것은 지속 가능하다" };
  if (fault === "absent_maya_korean_speech")
    return { en: "This is durable", ko: "마야가 말했다: 이것은 지속 가능하다" };
  if (fault === "qualitative_new_fact")
    return {
      en: "Customer switching costs remain durable",
      ko: "고객 전환 비용은 계속 견고하다",
    };
  return undefined;
}

export function specialistCandidate(input: string, fault: DepartmentFault) {
  const prompt = SpecialistPromptSchema.parse(
    JSON.parse(input.split("\n", 1)[0] ?? ""),
  );
  const roleId = prompt.request.role.id;
  const claimId = prompt.request.ids.claimId;
  const dissent =
    roleId === "market_news"
      ? [{ claimId, publicSummary: publicText("market dissent") }]
      : [];
  const publicSummary =
    fault === "source_backed_role_words" && roleId === "financial"
      ? {
          en: "market risk remains elevated; company_product coverage is unchanged",
          ko: "market risk는 높게 유지되고 company_product 범위는 변함없다",
        }
      : fault === "source_backed_issuer_report" && roleId === "financial"
        ? {
            en: "company reported higher revenue",
            ko: "회사가 더 높은 매출을 보고했다",
          }
        : publicText(roleId);
  return {
    kind: "memo",
    sourceArtifactIds: prompt.sourceArtifactIds,
    positions: [
      {
        claimId,
        stance: roleId === "market_news" ? "opposes" : "supports",
        publicSummary,
        evidenceArtifactIds: prompt.sourceArtifactIds,
      },
    ],
    dissent,
    unknowns: [publicText(`${roleId} unknown`)],
  };
}

export function departmentCandidate(
  request: DepartmentJobPrompt,
  fault: DepartmentFault,
) {
  const claims = request.memberArtifacts.flatMap((member) =>
    member.memo.positions.map((position) => position.claimId),
  );
  const dissent = request.memberArtifacts.flatMap(
    (member) => member.memo.dissent,
  );
  const dissentIds = dissent.map((item) => item.claimId);
  const agreementClaimIds = claims.filter(
    (claimId) => !dissentIds.includes(claimId),
  );
  const evidencePriorityArtifactIds = [
    ...new Set(
      request.memberArtifacts.flatMap((member) =>
        member.memo.positions.flatMap(
          (position) => position.evidenceArtifactIds,
        ),
      ),
    ),
  ].slice(0, 1);
  const firstClaim = claims[0];
  const lastClaim = claims.at(-1);
  if (
    firstClaim === undefined ||
    lastClaim === undefined ||
    evidencePriorityArtifactIds.length === 0
  )
    throw new TypeError("department fixture requires claims and evidence");
  const faultSummary =
    request.department.id === "financial"
      ? financialFaultSummary(fault)
      : undefined;
  const base = {
    kind: "department_consolidation",
    sourceArtifactIds: request.memberArtifacts.map(
      (member) => member.artifactId,
    ),
    agreementClaimIds,
    disagreementClaimIds: dissentIds,
    acceptedClaimIds: claims,
    strongestClaimIds: [firstClaim],
    weakestClaimIds: [lastClaim],
    revisedClaimIds: [],
    removedClaimIds: [],
    publicSummary:
      faultSummary ??
      request.memberArtifacts[0]?.memo.positions[0]?.publicSummary ??
      publicText(`${request.department.id} consolidation`),
    dissent,
    openQuestions: request.memberArtifacts.flatMap(
      (member) => member.memo.unknowns,
    ),
    evidencePriorityArtifactIds,
  };
  if (request.department.id !== "financial") return base;
  if (fault === "new_claim")
    return {
      ...base,
      agreementClaimIds: [
        ...base.agreementClaimIds,
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      ],
    };
  if (fault === "new_evidence")
    return {
      ...base,
      evidencePriorityArtifactIds: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
    };
  if (fault === "mistyped_dissent_claim")
    return {
      ...base,
      dissent: [
        {
          claimId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          publicSummary: publicText("generated dissent"),
        },
      ],
    };
  if (fault === "qualitative_new_dissent")
    return {
      ...base,
      agreementClaimIds: base.agreementClaimIds.filter(
        (claimId) => claimId !== firstClaim,
      ),
      disagreementClaimIds: [...base.disagreementClaimIds, firstClaim],
      dissent: [
        ...base.dissent,
        {
          claimId: firstClaim,
          publicSummary: {
            en: "Customer switching costs remain durable",
            ko: "고객 전환 비용은 계속 견고하다",
          },
        },
      ],
    };
  if (fault === "extra_open_question")
    return {
      ...base,
      openQuestions: [
        ...base.openQuestions,
        {
          en: "Could an undisclosed acquisition change the outlook?",
          ko: "미공개 인수가 전망을 바꿀 수 있는가?",
        },
      ],
    };
  return base;
}

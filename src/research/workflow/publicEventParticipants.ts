import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
  type AgentOutputStage,
  type WorkflowActorId,
  type WorkflowDepartmentId,
} from "../domain/roleRegistry";
import { CHALLENGE_ASSIGNMENTS } from "./challengeRoundContracts";

function departmentId(actorId: WorkflowActorId): WorkflowDepartmentId | undefined {
  return WORKFLOW_V1_DEPARTMENT_IDS.find((id) => id === actorId);
}

export function publicParticipantsForAgentOutput(
  stage: AgentOutputStage,
  actorId: WorkflowActorId,
): readonly WorkflowActorId[] {
  const department = departmentId(actorId);
  switch (stage) {
    case "department_consolidation":
      return department === undefined
        ? [actorId]
        : WORKFLOW_V1_ROLE_REGISTRY.departments[department].memberIds;
    case "blind_challenge": {
      const assignment = CHALLENGE_ASSIGNMENTS.find(
        (candidate) => candidate.challengerId === actorId,
      );
      return assignment === undefined
        ? [actorId]
        : [
            actorId,
            WORKFLOW_V1_ROLE_REGISTRY.departments[
              assignment.targetDepartmentId
            ].leadId,
          ];
    }
    case "owner_response_ballot": {
      const assignment = CHALLENGE_ASSIGNMENTS.find(
        (candidate) => candidate.targetDepartmentId === department,
      );
      return assignment === undefined
        ? [actorId]
        : [actorId, assignment.challengerId];
    }
    case "chair_synthesis":
      return [
        WORKFLOW_V1_CHAIR_ID,
        ...WORKFLOW_V1_DEPARTMENT_IDS.map(
          (id) => WORKFLOW_V1_ROLE_REGISTRY.departments[id].leadId,
        ),
      ];
    case "memo":
    case "follow_up":
    case "semantic_audit":
      return [actorId];
  }
}

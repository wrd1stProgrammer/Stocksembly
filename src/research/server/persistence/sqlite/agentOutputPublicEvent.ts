import type { AtomicAgentOutputCommit } from "../../../ports/agentOutputCommit";
import {
  AgentOutputStageSchema,
  WorkflowActorIdSchema,
} from "../../../domain/roleRegistry";
import { publicParticipantsForAgentOutput } from "../../../workflow/publicEventParticipants";
import { publicArtifactEventFields } from "../../../workflow/publicEvents";

export function acceptedAgentOutputPublicPayload(
  input: AtomicAgentOutputCommit,
) {
  const actor =
    input.event.roleId === "system"
      ? { participantIds: [] }
      : {
          actorId: input.event.roleId,
          participantIds: publicParticipantsForAgentOutput(
            AgentOutputStageSchema.parse(input.event.stage),
            WorkflowActorIdSchema.parse(input.event.roleId),
          ),
        };
  return {
    schemaVersion: "workflow-v1",
    artifactId: input.descriptor.artifactId,
    logicalArtifactId: input.expected.logicalArtifactId,
    ...actor,
    stage: input.event.stage,
    ...publicArtifactEventFields(input.envelope.payload),
  };
}

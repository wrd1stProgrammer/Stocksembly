import type {
  AcceptedCommitResult,
  AgentOutputCommitStorePort,
  AgentRunnerEvidenceRecorderPort,
  AtomicAgentOutputCommit,
  MalformedAgentOutputRejection,
  MalformedCommitResult,
  RecordAgentRunnerEvidenceInput,
} from "../../../ports/agentOutputCommit";
import type { LaunchReservationClaim } from "../../codex/codexReservation";
import {
  type AgentOutputInspectionClaim,
  inspectAgentOutputBinding,
} from "./agentOutputCommitRead";
import {
  commitAcceptedAgentOutput,
  rejectMalformedAgentOutput,
} from "./agentOutputCommitWrite";
import { recordAgentRunnerEvidence } from "./agentRunnerEvidenceRepository";
import {
  type RegisteredWebEvidence,
  registerAttemptWebEvidence,
} from "./attemptWebEvidenceRepository";
import type { ResearchDatabase } from "./database";
import { bindJobInputArtifact } from "./metadataRepository";
import type { BindJobInputArtifact } from "./types";

export class PostgresAgentOutputCommitStore
  implements AgentOutputCommitStorePort, AgentRunnerEvidenceRecorderPort
{
  constructor(private readonly database: ResearchDatabase) {}
  async inspect(claim: AgentOutputInspectionClaim): Promise<unknown> {
    return inspectAgentOutputBinding(this.database, claim);
  }
  async commitAccepted(
    input: AtomicAgentOutputCommit,
  ): Promise<AcceptedCommitResult> {
    return commitAcceptedAgentOutput(this.database, input);
  }
  async rejectMalformed(
    input: MalformedAgentOutputRejection,
  ): Promise<MalformedCommitResult> {
    return rejectMalformedAgentOutput(this.database, input);
  }
  async bindJobInputArtifact(input: BindJobInputArtifact): Promise<void> {
    await bindJobInputArtifact(this.database, input);
  }
  async recordRunnerEvidence(
    input: RecordAgentRunnerEvidenceInput,
  ): Promise<boolean> {
    return recordAgentRunnerEvidence(this.database, input);
  }
  async registerAttemptWebEvidence(input: {
    readonly claim: LaunchReservationClaim;
    readonly transcriptHash: string;
    readonly now: string;
    readonly artifacts: readonly RegisteredWebEvidence[];
  }): Promise<boolean> {
    return registerAttemptWebEvidence(this.database, input);
  }
  async close(): Promise<void> {
    /* The shared pool is process-owned. */
  }
}

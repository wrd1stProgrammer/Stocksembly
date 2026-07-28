import Database from "better-sqlite3";
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
import { bindJobInputArtifact } from "./metadataRepository";
import { applyOrderedMigrations } from "./migrations";
import type { BindJobInputArtifact } from "./types";

export class SqliteAgentOutputCommitStore
  implements AgentOutputCommitStorePort, AgentRunnerEvidenceRecorderPort
{
  readonly #database: Database.Database;

  constructor(
    path: string,
    options: { readonly migrationsDirectory?: string } = {},
  ) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  inspect(claim: AgentOutputInspectionClaim): unknown {
    return inspectAgentOutputBinding(this.#database, claim);
  }

  commitAccepted(input: AtomicAgentOutputCommit): AcceptedCommitResult {
    return commitAcceptedAgentOutput(this.#database, input);
  }

  rejectMalformed(input: MalformedAgentOutputRejection): MalformedCommitResult {
    return rejectMalformedAgentOutput(this.#database, input);
  }

  bindJobInputArtifact(input: BindJobInputArtifact): void {
    bindJobInputArtifact(this.#database, input);
  }

  recordRunnerEvidence(input: RecordAgentRunnerEvidenceInput): boolean {
    return recordAgentRunnerEvidence(this.#database, input);
  }

  registerAttemptWebEvidence(input: {
    readonly claim: LaunchReservationClaim;
    readonly transcriptHash: string;
    readonly now: string;
    readonly artifacts: readonly RegisteredWebEvidence[];
  }): boolean {
    return registerAttemptWebEvidence(this.#database, input);
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}

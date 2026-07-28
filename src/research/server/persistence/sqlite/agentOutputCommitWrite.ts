import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../../domain/callBudgetContracts";
import { canonicalJson } from "../../../domain/contractHelpers";
import type {
  AcceptedCommitResult,
  AtomicAgentOutputCommit,
  MalformedAgentOutputRejection,
  MalformedCommitResult,
} from "../../../ports/agentOutputCommit";
import {
  type AgentOutputInspectionClaim,
  inspectAgentOutputBinding,
} from "./agentOutputCommitRead";
import { acceptedAgentOutputPublicPayload } from "./agentOutputPublicEvent";
import { addArtifactEdge, saveArtifactMetadata } from "./metadataRepository";
import { appendRunEvent } from "./runRepository";

const ExistingSchema = z.object({
  artifact_id: z.string(),
  event_id: z.string(),
  owner_id: z.string(),
  fence_token: z.number().int().positive(),
  output_hash: z.string(),
});
const CountSchema = z.object({ count: z.number().int().nonnegative() });
const OrdinalSchema = z.object({ ordinal: z.number().int().nonnegative() });

function inspectionClaim(
  input: AtomicAgentOutputCommit,
): AgentOutputInspectionClaim {
  return {
    runId: input.expected.runId,
    jobId: input.expected.jobId,
    attemptId: input.expected.attemptId,
    ordinal: input.expected.ordinal,
    ownerId: input.claim.ownerId,
    token: input.claim.token,
    now: input.event.occurredAt,
  };
}

export function commitAcceptedAgentOutput(
  database: Database.Database,
  input: AtomicAgentOutputCommit,
): AcceptedCommitResult {
  return database
    .transaction((): AcceptedCommitResult => {
      const existingValue = database
        .prepare(`SELECT artifact_id, event_id, owner_id, fence_token, output_hash
        FROM agent_output_commits WHERE attempt_id = ?`)
        .get(input.expected.attemptId);
      if (existingValue !== undefined) {
        const existing = ExistingSchema.parse(existingValue);
        return existing.artifact_id === input.descriptor.artifactId &&
          existing.event_id === input.event.eventId &&
          existing.owner_id === input.claim.ownerId &&
          existing.fence_token === input.claim.token &&
          existing.output_hash === input.envelope.outputHash
          ? { kind: "duplicate" }
          : { kind: "rejected" };
      }
      if (
        inspectAgentOutputBinding(database, inspectionClaim(input)) ===
        undefined
      )
        return { kind: "rejected" };
      if (
        input.descriptor.runId !== input.expected.runId ||
        input.descriptor.snapshotId !== input.expected.snapshotId ||
        input.descriptor.artifactId !== input.event.artifactId
      )
        return { kind: "rejected" };
      saveArtifactMetadata(database, {
        artifactId: input.descriptor.artifactId,
        runId: input.expected.runId,
        snapshotId: input.expected.snapshotId,
        contentHash: input.descriptor.digest,
        byteLength: input.descriptor.byteLength,
        mediaType: input.descriptor.mediaType,
        logicalKey: input.expected.logicalArtifactId,
        inputHash: input.expected.inputHash,
        createdAt: input.event.occurredAt,
        locator: {
          kind: "artifact",
          artifactId: input.descriptor.artifactId,
          contentHash: input.descriptor.digest,
        },
      });
      for (const parentArtifactId of input.parentArtifactIds)
        addArtifactEdge(database, {
          childArtifactId: input.descriptor.artifactId,
          parentArtifactId,
          relation: "cites",
        });
      const attemptChanged = database
        .prepare(`UPDATE attempts SET status = 'succeeded', outcome = 'accepted'
        WHERE attempt_id = @attemptId AND status = 'running'`)
        .run({ attemptId: input.expected.attemptId }).changes;
      const jobChanged = database
        .prepare(`UPDATE jobs SET status = 'succeeded',
          result_artifact_id = @artifactId, lease_owner = NULL,
          lease_expires_at = NULL
        WHERE job_id = @jobId AND attempt_id = @attemptId
          AND status = 'running' AND lease_owner = @ownerId
          AND lease_token = @token AND lease_expires_at > @occurredAt`)
        .run({
          artifactId: input.descriptor.artifactId,
          jobId: input.expected.jobId,
          attemptId: input.expected.attemptId,
          ownerId: input.claim.ownerId,
          token: input.claim.token,
          occurredAt: input.event.occurredAt,
        }).changes;
      if (attemptChanged !== 1 || jobChanged !== 1) return { kind: "rejected" };
      const sequence = appendRunEvent(database, {
        runId: input.expected.runId,
        event: {
          eventId: input.event.eventId,
          type: input.event.type,
          stateId: `${input.event.stage}-accepted`,
          occurredAt: input.event.occurredAt,
          jobId: input.expected.jobId,
          attemptId: input.expected.attemptId,
          payload: acceptedAgentOutputPublicPayload(input),
        },
      });
      database
        .prepare(`INSERT INTO agent_output_commits(
          attempt_id, artifact_id, event_id, owner_id, fence_token,
          ordinal, output_hash, envelope_json, committed_at
        ) VALUES (
          @attemptId, @artifactId, @eventId, @ownerId, @fenceToken,
          @ordinal, @outputHash, @envelopeJson, @committedAt
        )`)
        .run({
          attemptId: input.expected.attemptId,
          artifactId: input.descriptor.artifactId,
          eventId: input.event.eventId,
          ownerId: input.claim.ownerId,
          fenceToken: input.claim.token,
          ordinal: input.expected.ordinal,
          outputHash: input.envelope.outputHash,
          envelopeJson: canonicalJson(input.envelope),
          committedAt: input.event.occurredAt,
        });
      return { kind: "committed", sequence };
    })
    .immediate();
}

export function rejectMalformedAgentOutput(
  database: Database.Database,
  input: MalformedAgentOutputRejection,
): MalformedCommitResult {
  return database
    .transaction((): MalformedCommitResult => {
      const claim = {
        runId: input.expected.runId,
        jobId: input.expected.jobId,
        attemptId: input.attemptId,
        ordinal: input.burnedOrdinal,
        ownerId: input.ownerId,
        token: input.token,
        now: input.occurredAt,
      };
      if (inspectAgentOutputBinding(database, claim) === undefined)
        return { kind: "rejected" };
      const replacements = CountSchema.parse(
        database
          .prepare(`SELECT COUNT(*) AS count FROM attempts
          WHERE run_id = ? AND replacement_of_attempt_id IS NOT NULL`)
          .get(input.expected.runId),
      ).count;
      const replacementBudget = z
        .object({
          requested_replacement_calls: z.number().int().nonnegative(),
        })
        .parse(
          database
            .prepare(`SELECT requested_replacement_calls
        FROM runs WHERE run_id = ?`)
            .get(input.expected.runId),
        ).requested_replacement_calls;
      const logicalAttempts = CountSchema.parse(
        database
          .prepare(`SELECT COUNT(*) AS count FROM attempts
          WHERE run_id = ? AND logical_artifact_key = ?`)
          .get(input.expected.runId, input.expected.logicalArtifactId),
      ).count;
      const latestOrdinal = OrdinalSchema.parse(
        database
          .prepare(`SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM research_call_ordinals WHERE run_id = ?`)
          .get(input.expected.runId),
      ).ordinal;
      const nextOrdinal = latestOrdinal + 1;
      if (
        replacementBudget === 0 ||
        replacements >= CALL_BUDGET_POLICY.maxRequiredReplacements ||
        logicalAttempts >= 2 ||
        nextOrdinal > CALL_BUDGET_POLICY.maxPhysicalLaunches
      ) {
        database
          .prepare(`UPDATE attempts SET status = 'failed', outcome = 'failed'
          WHERE attempt_id = ? AND status = 'running'`)
          .run(input.attemptId);
        database
          .prepare(`UPDATE jobs SET status = 'failed', lease_owner = NULL,
          lease_expires_at = NULL WHERE job_id = @jobId
          AND attempt_id = @attemptId AND lease_owner = @ownerId
          AND lease_token = @token`)
          .run({ ...input.expected, ...input });
        appendRunEvent(database, {
          runId: input.expected.runId,
          event: {
            eventId: input.replacementEventId,
            type: "attempt_committed",
            stateId: "failed",
            occurredAt: input.occurredAt,
            jobId: input.expected.jobId,
            attemptId: input.attemptId,
            payload: {
              classification: "incomplete",
              code:
                input.reason === "invalid_citation"
                  ? "specialist_citation_invalid_after_retry"
                  : `${input.expected.runnerStage}_output_invalid_after_retry`,
            },
          },
        });
        return { kind: "incomplete" };
      }
      database
        .prepare(`UPDATE attempts SET status = 'failed', outcome = 'failed'
        WHERE attempt_id = ? AND status = 'running'`)
        .run(input.attemptId);
      database
        .prepare(`INSERT INTO attempts(
          attempt_id, job_id, run_id, snapshot_id, kind, status,
          logical_artifact_key, input_hash, input_manifest_hash,
          replacement_of_attempt_id, created_at
        ) VALUES (
          @replacementAttemptId, @jobId, @runId, @snapshotId, 'research',
          'spawn-reserved', @logicalArtifactId, @inputHash,
          @attemptInputManifestHash, @attemptId, @occurredAt
        )`)
        .run({ ...input.expected, ...input });
      database
        .prepare(`INSERT INTO research_call_ordinals(
          run_id, ordinal, job_id, attempt_id, logical_artifact_key,
          input_hash, reserved_at
        ) VALUES (
          @runId, @ordinal, @jobId, @replacementAttemptId,
          @logicalArtifactId, @inputHash, @occurredAt
        )`)
        .run({ ...input.expected, ...input, ordinal: nextOrdinal });
      const changed = database
        .prepare(`UPDATE jobs SET status = 'spawn-reserved',
          attempt_id = @replacementAttemptId
        WHERE job_id = @jobId AND attempt_id = @attemptId
          AND status = 'running' AND lease_owner = @ownerId
          AND lease_token = @token AND lease_expires_at > @occurredAt`)
        .run({ ...input.expected, ...input }).changes;
      return changed === 1
        ? { kind: "replacement_reserved", ordinal: nextOrdinal }
        : { kind: "rejected" };
    })
    .immediate();
}

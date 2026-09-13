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
import { type ResearchDatabase, researchTransaction } from "./database";
import { StateConflictError } from "./errors";
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
export async function commitAcceptedAgentOutput(
  database: ResearchDatabase,
  input: AtomicAgentOutputCommit,
): Promise<AcceptedCommitResult> {
  return await researchTransaction(
    database,
    async (database): Promise<AcceptedCommitResult> => {
      await database.query(
        "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
        [input.expected.runId],
      );
      await database.query(
        "SELECT job_id FROM research.jobs WHERE job_id=$1 FOR UPDATE",
        [input.expected.jobId],
      );
      const existingValue = (
        await database.query(
          `SELECT artifact_id, event_id, owner_id, fence_token, output_hash
        FROM research.agent_output_commits WHERE attempt_id = $1`,
          [input.expected.attemptId],
        )
      ).rows[0];
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
        (await inspectAgentOutputBinding(database, inspectionClaim(input))) ===
        undefined
      )
        return { kind: "rejected" };
      if (
        input.descriptor.runId !== input.expected.runId ||
        input.descriptor.snapshotId !== input.expected.snapshotId ||
        input.descriptor.artifactId !== input.event.artifactId
      )
        return { kind: "rejected" };
      await saveArtifactMetadata(database, {
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
        await addArtifactEdge(database, {
          childArtifactId: input.descriptor.artifactId,
          parentArtifactId,
          relation: "cites",
        });
      const attemptChanged = (
        await database.query(
          `UPDATE research.attempts SET status = 'succeeded', outcome = 'accepted'
        WHERE attempt_id = $1 AND status = 'running'`,
          [input.expected.attemptId],
        )
      ).rowCount;
      const jobChanged = (
        await database.query(
          `UPDATE research.jobs SET status = 'succeeded',
          result_artifact_id = $1, lease_owner = NULL,
          lease_expires_at = NULL
        WHERE job_id = $2 AND attempt_id = $3
          AND status = 'running' AND lease_owner = $4
          AND lease_token = $5 AND lease_expires_at > $6`,
          [
            input.descriptor.artifactId,
            input.expected.jobId,
            input.expected.attemptId,
            input.claim.ownerId,
            input.claim.token,
            input.event.occurredAt,
          ],
        )
      ).rowCount;
      if (attemptChanged !== 1 || jobChanged !== 1)
        throw new StateConflictError(
          input.expected.attemptId,
          "agent output fence changed during commit",
        );
      const sequence = await appendRunEvent(database, {
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
      await database.query(
        `INSERT INTO research.agent_output_commits(
          attempt_id, artifact_id, event_id, owner_id, fence_token,
          ordinal, output_hash, envelope_json, committed_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9
        )`,
        [
          input.expected.attemptId,
          input.descriptor.artifactId,
          input.event.eventId,
          input.claim.ownerId,
          input.claim.token,
          input.expected.ordinal,
          input.envelope.outputHash,
          canonicalJson(input.envelope),
          input.event.occurredAt,
        ],
      );
      return { kind: "committed", sequence };
    },
  );
}
export async function rejectMalformedAgentOutput(
  database: ResearchDatabase,
  input: MalformedAgentOutputRejection,
): Promise<MalformedCommitResult> {
  return await researchTransaction(
    database,
    async (database): Promise<MalformedCommitResult> => {
      await database.query(
        "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
        [input.expected.runId],
      );
      await database.query(
        "SELECT job_id FROM research.jobs WHERE job_id=$1 FOR UPDATE",
        [input.expected.jobId],
      );
      const claim = {
        runId: input.expected.runId,
        jobId: input.expected.jobId,
        attemptId: input.attemptId,
        ordinal: input.burnedOrdinal,
        ownerId: input.ownerId,
        token: input.token,
        now: input.occurredAt,
      };
      if ((await inspectAgentOutputBinding(database, claim)) === undefined)
        return { kind: "rejected" };
      const replacements = CountSchema.parse(
        (
          await database.query(
            `SELECT COUNT(*)::integer AS count FROM research.attempts
          WHERE run_id = $1 AND replacement_of_attempt_id IS NOT NULL`,
            [input.expected.runId],
          )
        ).rows[0],
      ).count;
      const replacementBudget = z
        .object({
          requested_replacement_calls: z.number().int().nonnegative(),
        })
        .parse(
          (
            await database.query(
              `SELECT requested_replacement_calls
        FROM research.runs WHERE run_id = $1`,
              [input.expected.runId],
            )
          ).rows[0],
        ).requested_replacement_calls;
      // Transient roots do not spend rewrite capacity or reset rewrites already used.
      const logicalAttempts = CountSchema.parse(
        (
          await database.query(
            `SELECT 1 + COUNT(*)::integer AS count FROM research.attempts
            WHERE run_id = $1 AND logical_artifact_key = $2
              AND replacement_of_attempt_id IS NOT NULL`,
            [input.expected.runId, input.expected.logicalArtifactId],
          )
        ).rows[0],
      ).count;
      const latestOrdinal = OrdinalSchema.parse(
        (
          await database.query(
            `SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM research.research_call_ordinals WHERE run_id = $1`,
            [input.expected.runId],
          )
        ).rows[0],
      ).ordinal;
      const nextOrdinal = latestOrdinal + 1;
      if (
        replacementBudget === 0 ||
        replacements >= CALL_BUDGET_POLICY.maxRequiredReplacements ||
        logicalAttempts >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact ||
        nextOrdinal > CALL_BUDGET_POLICY.maxPhysicalLaunches
      ) {
        await database.query(
          `UPDATE research.attempts SET status = 'failed', outcome = 'failed'
          WHERE attempt_id = $1 AND status = 'running'`,
          [input.attemptId],
        );
        await database.query(
          `UPDATE research.jobs SET status = 'failed', lease_owner = NULL,
          lease_expires_at = NULL WHERE job_id = $1
          AND attempt_id = $2 AND lease_owner = $3
          AND lease_token = $4`,
          [input.expected.jobId, input.attemptId, input.ownerId, input.token],
        );
        await appendRunEvent(database, {
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
      await database.query(
        `UPDATE research.attempts SET status = 'failed', outcome = 'failed'
        WHERE attempt_id = $1 AND status = 'running'`,
        [input.attemptId],
      );
      await database.query(
        `INSERT INTO research.attempts(
          attempt_id, job_id, run_id, snapshot_id, kind, status,
          logical_artifact_key, input_hash, input_manifest_hash,
          replacement_of_attempt_id, created_at
        ) VALUES (
          $1, $2, $3, $4, 'research',
          'spawn-reserved', $5, $6,
          $7, $8, $9
        )`,
        [
          input.replacementAttemptId,
          input.expected.jobId,
          input.expected.runId,
          input.expected.snapshotId,
          input.expected.logicalArtifactId,
          input.expected.inputHash,
          input.expected.attemptInputManifestHash,
          input.attemptId,
          input.occurredAt,
        ],
      );
      await database.query(
        `INSERT INTO research.research_call_ordinals(
          run_id, ordinal, job_id, attempt_id, logical_artifact_key,
          input_hash, reserved_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7
        )`,
        [
          input.expected.runId,
          nextOrdinal,
          input.expected.jobId,
          input.replacementAttemptId,
          input.expected.logicalArtifactId,
          input.expected.inputHash,
          input.occurredAt,
        ],
      );
      const changed = (
        await database.query(
          `UPDATE research.jobs SET status = 'spawn-reserved',
          attempt_id = $1
        WHERE job_id = $2 AND attempt_id = $3
          AND status = 'running' AND lease_owner = $4
          AND lease_token = $5 AND lease_expires_at > $6`,
          [
            input.replacementAttemptId,
            input.expected.jobId,
            input.attemptId,
            input.ownerId,
            input.token,
            input.occurredAt,
          ],
        )
      ).rowCount;
      if (changed !== 1)
        throw new StateConflictError(
          input.attemptId,
          "replacement fence changed during commit",
        );
      return { kind: "replacement_reserved", ordinal: nextOrdinal };
    },
  );
}

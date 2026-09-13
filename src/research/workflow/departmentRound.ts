import { hashBytes } from "../domain/contractHelpers";
import { researchEvidenceExcerpt } from "../domain/researchEvidenceExcerpt";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { loadResearchMandateAtPath } from "./chairSynthesisArtifacts";
import type {
  DepartmentRoundReplay,
  PostgresDepartmentRound,
  PostgresDepartmentRoundOptions,
} from "./departmentRoundContracts";
import {
  authenticatedMemoPrompts,
  departmentJobs,
} from "./departmentRoundInput";
import { DepartmentRoundPostgresAuthority } from "./departmentRoundPostgresAuthority";
import { createDepartmentRoundAttemptHandler } from "./departmentRoundPostgresHandler";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";
import { structuredTeamEvidence } from "./teamEvidenceContract";

export type {
  AcceptedMemoMetadata,
  DepartmentRoundReplay,
  PostgresDepartmentRound,
  PostgresDepartmentRoundOptions,
  StageDepartmentRoundInput,
  StageDepartmentRoundResult,
} from "./departmentRoundContracts";

async function replayResult(
  runId: string,
  authority: DepartmentRoundPostgresAuthority,
): Promise<DepartmentRoundReplay> {
  const replay = await authority.replay(runId);
  const committedDepartmentIds = replay.commits.map((commit) =>
    WORKFLOW_V1_DEPARTMENT_IDS.find(
      (departmentId) =>
        commit.logical_artifact_key === `consolidation:${departmentId}`,
    ),
  );
  const acceptedIds = committedDepartmentIds.flatMap((departmentId) =>
    departmentId === undefined ? [] : [departmentId],
  );
  return {
    runId,
    snapshotId: replay.snapshotId,
    challengeStartAllowed:
      acceptedIds.length === WORKFLOW_V1_DEPARTMENT_IDS.length &&
      new Set(acceptedIds).size === WORKFLOW_V1_DEPARTMENT_IDS.length,
    receipts: replay.receipts,
    artifactIds: replay.commits.map((commit) => commit.artifact_id),
    committedDepartmentIds: acceptedIds,
    eventSequences: replay.commits.map((commit) => commit.sequence),
  };
}

export function createPostgresDepartmentRound(
  options: PostgresDepartmentRoundOptions,
): PostgresDepartmentRound {
  const workflowAuthority = new SpecialistRoundPostgresAuthority(
    options.database,
  );
  const departmentAuthority = new DepartmentRoundPostgresAuthority(
    options.database,
  );
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const handler = createDepartmentRoundAttemptHandler({
    options,
    workflowAuthority,
    departmentAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "postgres-worker-trusted-commit",
    acceptedMemos: async (runId) =>
      await departmentAuthority.acceptedMemos(runId),
    async stage(input) {
      const rows = await departmentAuthority.acceptedMemoRows(input.runId);
      const authenticated = await authenticatedMemoPrompts(options.cas, rows, {
        runId: input.runId,
        artifactIds: input.memberArtifactIds,
      });
      if (authenticated.kind === "blocked") return authenticated;
      const first = rows[0];
      if (first === undefined)
        return {
          kind: "blocked",
          reason: "accepted_specialist_set_incomplete",
        };
      const mandate = await loadResearchMandateAtPath(
        options.database,
        input.runId,
      );
      const reviewedPrompts = await Promise.all(
        authenticated.prompts.map(async (prompt) => {
          const positions = prompt.memberArtifacts.flatMap(
            (member) => member.memo.positions,
          );
          const ids = [
            ...new Set(
              positions.flatMap((position) => position.evidenceArtifactIds),
            ),
          ];
          const evidenceReview = [];
          let remaining = 36000;
          let remainingFacts = 24000;
          for (const row of (
            await departmentAuthority.evidenceRows(input.runId, ids)
          ).slice(0, 32)) {
            const source = await options.cas.get(
              ArtifactDigestSchema.parse(row.content_hash),
            );
            if (
              !source ||
              source.descriptor.artifactId !== row.artifact_id ||
              source.descriptor.snapshotId !== first.snapshot_id ||
              hashBytes(source.bytes) !== row.content_hash
            )
              continue;
            const focus = positions
              .filter((position) =>
                position.evidenceArtifactIds.includes(row.artifact_id),
              )
              .flatMap((position) => [
                position.publicSummary.en,
                position.publicSummary.ko,
              ]);
            const sourceText = new TextDecoder().decode(source.bytes);
            const extractedFacts = structuredTeamEvidence(sourceText);
            const structuredFacts =
              extractedFacts &&
              extractedFacts.length <= Math.min(18000, remainingFacts)
                ? extractedFacts
                : undefined;
            remainingFacts -= structuredFacts?.length ?? 0;
            const excerpt = researchEvidenceExcerpt(
              sourceText,
              focus,
              Math.min(6000, remaining),
            );
            if (!excerpt) break;
            remaining -= excerpt.length;
            evidenceReview.push({
              artifactId: row.artifact_id,
              excerpt,
              ...(structuredFacts && structuredFacts.length <= 18000
                ? { structuredFacts }
                : {}),
            });
          }
          return { ...prompt, evidenceReview };
        }),
      );
      const jobs = departmentJobs(
        input.runId,
        first.snapshot_id,
        reviewedPrompts,
        mandate,
      );
      const staged = await departmentAuthority.stageJobs(
        input.runId,
        jobs,
        rows.map((row) => row.artifact_id),
        now(),
      );
      return staged
        ? { kind: "staged", jobIds: jobs.map((job) => job.jobId) }
        : {
            kind: "blocked",
            reason: "accepted_specialist_set_incomplete",
          };
    },
    async drain(runId) {
      const engine = createLeaseEngine({
        pool: options.database,
        ownerId: options.ownerId,
        handler,
        clock: { now },
      });
      for (;;) {
        const results = await Promise.all([
          engine.poll(),
          engine.poll(),
          engine.poll(),
        ]);
        if (results.every((result) => result.kind === "idle")) break;
      }
      await engine.shutdown();
      return await replayResult(runId, departmentAuthority);
    },
    replay: async (runId) => await replayResult(runId, departmentAuthority),
    async close() {
      await commitStore.close();
      departmentAuthority.close();
      workflowAuthority.close();
    },
  };
}

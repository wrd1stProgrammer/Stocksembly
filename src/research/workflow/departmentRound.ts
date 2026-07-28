import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import type {
  DepartmentRoundReplay,
  SqliteDepartmentRound,
  SqliteDepartmentRoundOptions,
} from "./departmentRoundContracts";
import {
  authenticatedMemoPrompts,
  departmentJobs,
} from "./departmentRoundInput";
import { DepartmentRoundSqliteAuthority } from "./departmentRoundSqliteAuthority";
import { createDepartmentRoundAttemptHandler } from "./departmentRoundSqliteHandler";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

export type {
  AcceptedMemoMetadata,
  DepartmentRoundReplay,
  SqliteDepartmentRound,
  SqliteDepartmentRoundOptions,
  StageDepartmentRoundInput,
  StageDepartmentRoundResult,
} from "./departmentRoundContracts";

function replayResult(
  runId: string,
  authority: DepartmentRoundSqliteAuthority,
): DepartmentRoundReplay {
  const replay = authority.replay(runId);
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

export function createSqliteDepartmentRound(
  options: SqliteDepartmentRoundOptions,
): SqliteDepartmentRound {
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const workflowAuthority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const departmentAuthority = new DepartmentRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const handler = createDepartmentRoundAttemptHandler({
    options,
    workflowAuthority,
    departmentAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "sqlite-worker-trusted-commit",
    acceptedMemos: (runId) => departmentAuthority.acceptedMemos(runId),
    async stage(input) {
      const rows = departmentAuthority.acceptedMemoRows(input.runId);
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
      const jobs = departmentJobs(
        input.runId,
        first.snapshot_id,
        authenticated.prompts,
      );
      const staged = departmentAuthority.stageJobs(
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
        databasePath: options.databasePath,
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
      return replayResult(runId, departmentAuthority);
    },
    replay: (runId) => replayResult(runId, departmentAuthority),
    async close() {
      commitStore.close();
      departmentAuthority.close();
      workflowAuthority.close();
    },
  };
}

import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { ChallengeRoundSqliteAuthority } from "./challengeRoundSqliteAuthority";
import { parseCommittedInputs } from "./followupAndResponseRoundAuthentication";
import type {
  BallotVote,
  FollowupAndResponseReplay,
  FollowupAndResponseRoundOptions,
  SqliteFollowupAndResponseRound,
} from "./followupAndResponseRoundContracts";
import {
  ownerResponseJobs,
  publicUnknowns,
  rankedFollowupJobs,
} from "./followupAndResponseRoundInput";
import { FollowupAndResponseRoundSqliteAuthority } from "./followupAndResponseRoundSqliteAuthority";
import { createFollowupAndResponseAttemptHandler } from "./followupAndResponseRoundSqliteHandler";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

export type * from "./followupAndResponseRoundContracts";

export function followupAllowance(
  replacementsUsed: number,
): number | "incomplete" {
  if (
    !Number.isInteger(replacementsUsed) ||
    replacementsUsed < 0 ||
    replacementsUsed > CALL_BUDGET_POLICY.maxRequiredReplacements
  )
    return "incomplete";
  return Math.min(
    CALL_BUDGET_POLICY.maxOptionalFollowups,
    CALL_BUDGET_POLICY.maxPhysicalLaunches -
      CALL_BUDGET_POLICY.initialCollectionAttempts -
      CALL_BUDGET_POLICY.mandatoryFirstAttempts -
      replacementsUsed,
  );
}

export function committeeConsensus(
  ballots: readonly BallotVote[],
): BallotVote | "incomplete" {
  if (ballots.length !== 4) return "incomplete";
  const count = (vote: BallotVote) =>
    ballots.filter((item) => item === vote).length;
  if (count("oppose") >= 2) return "oppose";
  if (count("support") >= 3) return "support";
  if (count("abstain") === 4) return "abstain";
  return "support_with_reservations";
}

async function drainJobs(
  options: FollowupAndResponseRoundOptions,
  handler: ReturnType<typeof createFollowupAndResponseAttemptHandler>,
): Promise<void> {
  const engine = createLeaseEngine({
    databasePath: options.databasePath,
    ownerId: options.ownerId,
    handler,
    clock: { now: options.now ?? (() => new Date().toISOString()) },
  });
  for (;;) {
    const results = await Promise.all([
      engine.poll(),
      engine.poll(),
      engine.poll(),
    ]);
    if (
      results.every(
        (result) => result.kind === "idle" || result.kind === "incomplete",
      )
    )
      break;
  }
  await engine.shutdown();
}

export function createSqliteFollowupAndResponseRound(
  options: FollowupAndResponseRoundOptions,
): SqliteFollowupAndResponseRound {
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const workflowAuthority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const challengeAuthority = new ChallengeRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const roundAuthority = new FollowupAndResponseRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const handler = createFollowupAndResponseAttemptHandler({
    options,
    workflowAuthority,
    roundAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  const replay = (
    runId: string,
    reasonOverride?: "plan_lineage_mismatch",
  ): FollowupAndResponseReplay => {
    const durable = roundAuthority.replay(runId);
    const plan = roundAuthority.loadPlan(runId);
    const incompleteReason =
      reasonOverride ??
      (plan === undefined
        ? roundAuthority.hasPlanRecord(runId)
          ? "plan_lineage_mismatch"
          : "plan_not_staged"
        : null);
    return {
      runId,
      snapshotId: durable.snapshotId,
      responseStartAllowed:
        durable.ballots.length === WORKFLOW_V1_DEPARTMENT_IDS.length,
      receipts: durable.receipts,
      followupArtifactIds: durable.followups.map((item) => item.artifact_id),
      ballotArtifactIds: durable.ballots.map((item) => item.artifact_id),
      publicUnknowns: roundAuthority.loadUnknowns(runId),
      consensus: committeeConsensus(durable.votes),
      drainState: incompleteReason === null ? "ready" : "incomplete",
      incompleteReason,
    };
  };
  const advance = async (runId: string): Promise<FollowupAndResponseReplay> => {
    const plan = roundAuthority.loadPlan(runId);
    if (plan === undefined) return replay(runId);
    const challengeRows = challengeAuthority.acceptedRows(runId, "challenge");
    if (
      challengeRows.length !== plan.challengeArtifactIds.length ||
      challengeRows.some(
        (row) => !plan.challengeArtifactIds.includes(row.artifact_id),
      ) ||
      plan.followupLogicalArtifactIds.some(
        (logicalId) => roundAuthority.loadJob(runId, logicalId) === undefined,
      )
    )
      return replay(runId, "plan_lineage_mismatch");
    const readyDepartmentIds = new Set(
      WORKFLOW_V1_DEPARTMENT_IDS.filter((departmentId) => {
        const logicalId = `followup:${departmentId}`;
        return (
          !plan.followupLogicalArtifactIds.includes(logicalId) ||
          roundAuthority.jobsSettled(runId, [logicalId])
        );
      }),
    );
    const stagedInputs = await parseCommittedInputs(
      options.cas,
      challengeRows,
      challengeAuthority.acceptedRows(runId, "memo"),
    );
    if (
      stagedInputs === undefined ||
      stagedInputs.snapshotId !== plan.snapshotId
    )
      return replay(runId, "plan_lineage_mismatch");
    const durable = roundAuthority.replay(runId);
    const unknowns = roundAuthority.loadUnknowns(runId);
    roundAuthority.savePlan({ ...plan, unknowns }, now());
    const jobs = ownerResponseJobs(
      runId,
      stagedInputs,
      durable.followups,
      unknowns,
      readyDepartmentIds,
    );
    const responseAt = new Date(Date.parse(now()) + 1).toISOString();
    roundAuthority.stageJobs(runId, jobs, "response", responseAt);
    return replay(runId);
  };
  return {
    authority: "sqlite-worker-trusted-commit",
    async stage(input) {
      const challengeRows = challengeAuthority.acceptedRows(
        input.runId,
        "challenge",
      );
      if (challengeRows.length !== 4)
        return { kind: "blocked", reason: "accepted_challenge_set_incomplete" };
      if (
        input.challengeArtifactIds.length !== 4 ||
        challengeRows.some(
          (row) => !input.challengeArtifactIds.includes(row.artifact_id),
        )
      )
        return { kind: "blocked", reason: "cross_run_or_snapshot_challenge" };
      const replacements = roundAuthority.replacementCount(input.runId);
      if (replacements > CALL_BUDGET_POLICY.maxRequiredReplacements)
        return { kind: "blocked", reason: "physical_launch_budget_exhausted" };
      const stagedInputs = await parseCommittedInputs(
        options.cas,
        challengeRows,
        challengeAuthority.acceptedRows(input.runId, "memo"),
      );
      if (stagedInputs === undefined)
        return {
          kind: "blocked",
          reason: "challenge_artifact_authentication_failed",
        };
      const allowed = followupAllowance(replacements);
      if (allowed === "incomplete")
        return { kind: "blocked", reason: "physical_launch_budget_exhausted" };
      const jobs = rankedFollowupJobs(input.runId, stagedInputs, allowed);
      const stagedUnknowns = publicUnknowns(stagedInputs, jobs);
      if (!roundAuthority.stageJobs(input.runId, jobs, "followup", now()))
        return { kind: "blocked", reason: "physical_launch_budget_exhausted" };
      roundAuthority.savePlan(
        {
          runId: input.runId,
          snapshotId: stagedInputs.snapshotId,
          challengeArtifactIds: challengeRows.map((row) => row.artifact_id),
          followupLogicalArtifactIds: jobs.map((job) => job.logicalArtifactId),
          unknowns: stagedUnknowns,
        },
        now(),
      );
      return {
        kind: "staged",
        allowedFollowups: allowed,
        selectedFollowups: jobs.length,
        projectedPhysicalLaunches:
          CALL_BUDGET_POLICY.initialCollectionAttempts +
          CALL_BUDGET_POLICY.mandatoryFirstAttempts +
          replacements +
          jobs.length,
        publicUnknowns: stagedUnknowns,
      };
    },
    advance,
    async drain(runId) {
      await drainJobs(options, handler);
      await advance(runId);
      await drainJobs(options, handler);
      return replay(runId);
    },
    replay,
    async close() {
      commitStore.close();
      roundAuthority.close();
      challengeAuthority.close();
      workflowAuthority.close();
    },
  };
}

import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { ChallengeRoundPostgresAuthority } from "./challengeRoundPostgresAuthority";
import { parseCommittedInputs } from "./followupAndResponseRoundAuthentication";
import type {
  BallotVote,
  FollowupAndResponseReplay,
  FollowupAndResponseRoundOptions,
  PostgresFollowupAndResponseRound,
} from "./followupAndResponseRoundContracts";
import {
  ownerResponseJobs,
  publicUnknowns,
  rankedFollowupJobs,
} from "./followupAndResponseRoundInput";
import { FollowupAndResponseRoundPostgresAuthority } from "./followupAndResponseRoundPostgresAuthority";
import { createFollowupAndResponseAttemptHandler } from "./followupAndResponseRoundPostgresHandler";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";

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
    pool: options.database,
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

export function createPostgresFollowupAndResponseRound(
  options: FollowupAndResponseRoundOptions,
): PostgresFollowupAndResponseRound {
  const workflowAuthority = new SpecialistRoundPostgresAuthority(
    options.database,
  );
  const challengeAuthority = new ChallengeRoundPostgresAuthority(
    options.database,
  );
  const roundAuthority = new FollowupAndResponseRoundPostgresAuthority(
    options.database,
  );
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const handler = createFollowupAndResponseAttemptHandler({
    options,
    workflowAuthority,
    roundAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  const replay = async (
    runId: string,
    reasonOverride?: "plan_lineage_mismatch",
  ): Promise<FollowupAndResponseReplay> => {
    const durable = await roundAuthority.replay(runId);
    const plan = await roundAuthority.loadPlan(runId);
    const incompleteReason =
      reasonOverride ??
      (plan === undefined
        ? (await roundAuthority.hasPlanRecord(runId))
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
      publicUnknowns: await roundAuthority.loadUnknowns(runId),
      consensus: committeeConsensus(durable.votes),
      drainState: incompleteReason === null ? "ready" : "incomplete",
      incompleteReason,
    };
  };
  const advance = async (runId: string): Promise<FollowupAndResponseReplay> => {
    const plan = await roundAuthority.loadPlan(runId);
    if (plan === undefined) return await replay(runId);
    const challengeRows = await challengeAuthority.acceptedRows(
      runId,
      "challenge",
    );
    if (
      challengeRows.length !== plan.challengeArtifactIds.length ||
      challengeRows.some(
        (row) => !plan.challengeArtifactIds.includes(row.artifact_id),
      ) ||
      (
        await Promise.all(
          plan.followupLogicalArtifactIds.map((logicalId) =>
            roundAuthority.loadJob(runId, logicalId),
          ),
        )
      ).some((job) => job === undefined)
    )
      return await replay(runId, "plan_lineage_mismatch");
    const readyDepartmentIds = new Set<
      (typeof WORKFLOW_V1_DEPARTMENT_IDS)[number]
    >();
    for (const departmentId of WORKFLOW_V1_DEPARTMENT_IDS) {
      const logicalId = `followup:${departmentId}`;
      if (
        !plan.followupLogicalArtifactIds.includes(logicalId) ||
        (await roundAuthority.jobsSettled(runId, [logicalId]))
      ) {
        readyDepartmentIds.add(departmentId);
      }
    }
    const stagedInputs = await parseCommittedInputs(
      options.cas,
      challengeRows,
      await challengeAuthority.acceptedRows(runId, "memo"),
    );
    if (
      stagedInputs === undefined ||
      stagedInputs.snapshotId !== plan.snapshotId
    )
      return await replay(runId, "plan_lineage_mismatch");
    const durable = await roundAuthority.replay(runId);
    const unknowns = await roundAuthority.loadUnknowns(runId);
    await roundAuthority.savePlan({ ...plan, unknowns }, now());
    const jobs = ownerResponseJobs(
      runId,
      stagedInputs,
      durable.followups,
      unknowns,
      readyDepartmentIds,
    );
    const responseAt = new Date(Date.parse(now()) + 1).toISOString();
    await roundAuthority.stageJobs(runId, jobs, "response", responseAt);
    return await replay(runId);
  };
  return {
    authority: "postgres-worker-trusted-commit",
    async stage(input) {
      const challengeRows = await challengeAuthority.acceptedRows(
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
      const replacements = await roundAuthority.replacementCount(input.runId);
      if (replacements > CALL_BUDGET_POLICY.maxRequiredReplacements)
        return { kind: "blocked", reason: "physical_launch_budget_exhausted" };
      const stagedInputs = await parseCommittedInputs(
        options.cas,
        challengeRows,
        await challengeAuthority.acceptedRows(input.runId, "memo"),
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
      if (
        !(await roundAuthority.stageJobs(input.runId, jobs, "followup", now()))
      )
        return { kind: "blocked", reason: "physical_launch_budget_exhausted" };
      await roundAuthority.savePlan(
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
      return await replay(runId);
    },
    replay,
    async close() {
      await commitStore.close();
      roundAuthority.close();
      challengeAuthority.close();
      workflowAuthority.close();
    },
  };
}

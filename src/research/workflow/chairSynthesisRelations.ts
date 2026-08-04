import type Database from "better-sqlite3";
import { z } from "zod";
import {
  BlindChallengeOutputSchema,
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
  OwnerResponseBallotOutputSchema,
} from "../domain/agentOutputs";
import type { ArtifactIdSchema, ClaimIdSchema } from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import {
  ChallengeJobPromptSchema,
  PersistedChallengeJobSchema,
} from "./challengeRoundContracts";
import {
  type ChairArtifactRow,
  chairAgentPayload,
} from "./chairSynthesisArtifacts";

type Context = {
  readonly database: Database.Database;
  readonly cas: ArtifactCasPort;
  readonly rows: readonly ChairArtifactRow[];
  readonly auditedClaimIds: ReadonlySet<string>;
  readonly dissentClaimIds: readonly string[];
};

export async function loadChairRelations(context: Context) {
  const positions: {
    departmentId: (typeof WORKFLOW_V1_DEPARTMENT_IDS)[number];
    artifactId: z.infer<typeof ArtifactIdSchema>;
    claimIds: readonly z.infer<typeof ClaimIdSchema>[];
    summary: { en: string; ko: string };
  }[] = [];
  const ballots: {
    departmentId: (typeof WORKFLOW_V1_DEPARTMENT_IDS)[number];
    artifactId: z.infer<typeof ArtifactIdSchema>;
    claimIds: readonly z.infer<typeof ClaimIdSchema>[];
    vote: "support" | "support_with_reservations" | "oppose" | "abstain";
    rationale: { en: string; ko: string };
  }[] = [];
  const authenticated: {
    readonly row: ChairArtifactRow;
    readonly payload: unknown;
  }[] = [];
  const revisions: {
    readonly originClaimId: z.infer<typeof ClaimIdSchema>;
    readonly adjudicatedClaimId: z.infer<typeof ClaimIdSchema>;
    readonly publicSummary: { readonly en: string; readonly ko: string };
    readonly falsifier: { readonly en: string; readonly ko: string };
    readonly sourceArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
  }[] = [];
  const challengeDissent: {
    readonly sentenceId: string;
    readonly sourceArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
    readonly claimIds: readonly z.infer<typeof ClaimIdSchema>[];
    readonly text: { readonly en: string; readonly ko: string };
  }[] = [];
  const responseDissent: {
    readonly sentenceId: string;
    readonly sourceArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
    readonly claimIds: readonly z.infer<typeof ClaimIdSchema>[];
    readonly text: { readonly en: string; readonly ko: string };
  }[] = [];
  for (const departmentId of WORKFLOW_V1_DEPARTMENT_IDS) {
    const positionRow = context.rows.find(
      (row) => row.logical_key === `consolidation:${departmentId}`,
    );
    const ballotRow = context.rows.find(
      (row) => row.logical_key === `response_ballot:${departmentId}`,
    );
    if (positionRow === undefined || ballotRow === undefined) return undefined;
    const position = DepartmentConsolidationOutputSchema.safeParse(
      await chairAgentPayload(
        context.cas,
        positionRow,
        `consolidation:${departmentId}`,
      ),
    );
    const ballot = OwnerResponseBallotOutputSchema.safeParse(
      await chairAgentPayload(
        context.cas,
        ballotRow,
        `response_ballot:${departmentId}`,
      ),
    );
    if (!position.success || !ballot.success) return undefined;
    authenticated.push(
      { row: positionRow, payload: position.data },
      { row: ballotRow, payload: ballot.data },
    );
    const authenticatedRevisionIds = new Set(
      position.data.revisions
        .filter((revision) => context.auditedClaimIds.has(revision.originClaimId))
        .map((revision) => revision.adjudicatedClaimId),
    );
    positions.push({
      departmentId,
      artifactId: positionRow.artifact_id,
      claimIds: position.data.acceptedClaimIds.filter(
        (claimId) =>
          context.auditedClaimIds.has(claimId) ||
          authenticatedRevisionIds.has(claimId),
      ),
      summary: position.data.publicSummary,
    });
    revisions.push(
      ...position.data.revisions.filter((revision) =>
        authenticatedRevisionIds.has(revision.adjudicatedClaimId),
      ),
    );
    ballots.push({
      departmentId,
      artifactId: ballotRow.artifact_id,
      claimIds: ballot.data.ballot.rationaleClaimIds.filter((claimId) =>
        context.auditedClaimIds.has(claimId),
      ),
      vote: ballot.data.ballot.vote,
      rationale: ballot.data.ballot.publicRationale,
    });
    responseDissent.push(
      ...ballot.data.dissent
        .filter(
          (entry) =>
            context.auditedClaimIds.has(entry.claimId) &&
            entry.publicSummary.en.length <= 360 &&
            entry.publicSummary.ko.length <= 360,
        )
        .map((entry) => ({
          sentenceId: `dissent:response_ballot:${departmentId}:${entry.claimId}`,
          sourceArtifactIds: [ballotRow.artifact_id],
          claimIds: [entry.claimId],
          text: entry.publicSummary,
        })),
    );
  }
  for (const row of context.rows.filter((item) =>
    item.logical_key.startsWith("memo:"),
  )) {
    const payload = await chairAgentPayload(context.cas, row, row.logical_key);
    if (!MemoOutputSchema.safeParse(payload).success) return undefined;
    authenticated.push({ row, payload });
  }
  for (const row of context.rows.filter((item) =>
    item.logical_key.startsWith("challenge:"),
  )) {
    const challenge = BlindChallengeOutputSchema.safeParse(
      await chairAgentPayload(context.cas, row, row.logical_key),
    );
    if (!challenge.success) return undefined;
    const stored = z
      .object({ request_hash: z.string(), result_json: z.string() })
      .safeParse(
        context.database
          .prepare(`SELECT request_hash, result_json FROM idempotency_records
            WHERE scope = 'challenge-round-job' AND idempotency_key = ?`)
          .get(`${row.run_id}:${row.logical_key}`),
      );
    if (!stored.success) return undefined;
    const job = PersistedChallengeJobSchema.safeParse(
      parseSafeJson(stored.data.result_json),
    );
    if (
      !job.success ||
      job.data.runId !== row.run_id ||
      job.data.snapshotId !== row.snapshot_id ||
      job.data.logicalArtifactId !== row.logical_key ||
      job.data.inputHash !== stored.data.request_hash
    )
      return undefined;
    const prompt = ChallengeJobPromptSchema.safeParse(
      parseSafeJson(job.data.prompt),
    );
    if (
      !prompt.success ||
      challenge.data.challengedClaimIds[0] !== prompt.data.target.claimId
    )
      return undefined;
    const challengedClaimId = challenge.data.challengedClaimIds[0];
    if (!context.auditedClaimIds.has(challengedClaimId)) continue;
    if (
      prompt.data.counterpoint.publicSummary.en.length > 360 ||
      prompt.data.counterpoint.publicSummary.ko.length > 360
    )
      continue;
    const counterMemo = prompt.data.sourceArtifacts.find(
      (source) => source.relation === "counter_memo",
    );
    if (counterMemo === undefined) return undefined;
    challengeDissent.push({
      sentenceId: `dissent:${row.logical_key}:${challenge.data.challengedClaimIds[0]}`,
      sourceArtifactIds: [row.artifact_id, counterMemo.artifactId],
      claimIds: [challengedClaimId],
      text: prompt.data.counterpoint.publicSummary,
    });
  }
  const dissent = context.dissentClaimIds.map((claimId) => {
    for (const item of authenticated) {
      const memo = MemoOutputSchema.safeParse(item.payload);
      if (memo.success) {
        const entry =
          memo.data.dissent.find((value) => value.claimId === claimId) ??
          memo.data.positions.find(
            (value) =>
              value.claimId === claimId &&
              (value.stance === "opposes" || value.stance === "uncertain"),
          );
        if (entry !== undefined)
          return {
            claimId,
            artifactId: item.row.artifact_id,
            text: entry.publicSummary,
          };
      }
      const position = DepartmentConsolidationOutputSchema.safeParse(
        item.payload,
      );
      const positionEntry = position.success
        ? position.data.dissent.find((value) => value.claimId === claimId)
        : undefined;
      if (positionEntry !== undefined)
        return {
          claimId,
          artifactId: item.row.artifact_id,
          text: positionEntry.publicSummary,
        };
      const ballot = OwnerResponseBallotOutputSchema.safeParse(item.payload);
      const ballotEntry = ballot.success
        ? ballot.data.dissent.find((value) => value.claimId === claimId)
        : undefined;
      if (ballotEntry !== undefined)
        return {
          claimId,
          artifactId: item.row.artifact_id,
          text: ballotEntry.publicSummary,
        };
    }
    return undefined;
  });
  return {
    positions,
    ballots,
    dissent,
    challengeDissent,
    responseDissent,
    revisions,
  };
}

import type { z } from "zod";
import {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
  OwnerResponseBallotOutputSchema,
} from "../domain/agentOutputs";
import type { ArtifactIdSchema, ClaimIdSchema } from "../domain/ids";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import {
  type ChairArtifactRow,
  chairAgentPayload,
} from "./chairSynthesisArtifacts";

type Context = {
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
    positions.push({
      departmentId,
      artifactId: positionRow.artifact_id,
      claimIds: position.data.acceptedClaimIds.filter((claimId) =>
        context.auditedClaimIds.has(claimId),
      ),
      summary: position.data.publicSummary,
    });
    ballots.push({
      departmentId,
      artifactId: ballotRow.artifact_id,
      claimIds: ballot.data.ballot.rationaleClaimIds.filter((claimId) =>
        context.auditedClaimIds.has(claimId),
      ),
      vote: ballot.data.ballot.vote,
      rationale: ballot.data.ballot.publicRationale,
    });
  }
  for (const row of context.rows.filter((item) =>
    item.logical_key.startsWith("memo:"),
  )) {
    const payload = await chairAgentPayload(context.cas, row, row.logical_key);
    if (!MemoOutputSchema.safeParse(payload).success) return undefined;
    authenticated.push({ row, payload });
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
  return { positions, ballots, dissent };
}

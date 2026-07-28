import { z } from "zod";
import {
  BlindChallengeOutputSchema,
  MemoOutputSchema,
} from "../domain/agentOutputs";
import { hashBytes } from "../domain/contractHelpers";
import {
  WORKFLOW_V1_SPECIALIST_IDS,
  type WorkflowDepartmentId,
} from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import type { AcceptedChallengeInputRow } from "./challengeRoundSqliteAuthority";

const EnvelopeSchema = z
  .object({
    runId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    logicalArtifactId: z.string(),
    payload: z.union([BlindChallengeOutputSchema, MemoOutputSchema]),
  })
  .passthrough();

export type AuthenticatedRoundInput = {
  readonly challenges: readonly {
    readonly artifactId: string;
    readonly challengerId: WorkflowDepartmentId;
    readonly targetDepartmentId: WorkflowDepartmentId;
    readonly payload: z.infer<typeof BlindChallengeOutputSchema>;
  }[];
  readonly memos: readonly {
    readonly artifactId: string;
    readonly roleId: string;
    readonly payload: z.infer<typeof MemoOutputSchema>;
  }[];
  readonly snapshotId: AcceptedChallengeInputRow["snapshot_id"];
};

export async function parseCommittedInputs(
  cas: ArtifactCasPort,
  challengeRows: readonly AcceptedChallengeInputRow[],
  memoRows: readonly AcceptedChallengeInputRow[],
): Promise<AuthenticatedRoundInput | undefined> {
  const envelopes = new Map<string, z.infer<typeof EnvelopeSchema>>();
  for (const row of [...challengeRows, ...memoRows]) {
    const read = await cas.get(ArtifactDigestSchema.parse(row.content_hash));
    if (
      read === undefined ||
      read.descriptor.artifactId !== row.artifact_id ||
      read.descriptor.runId !== row.run_id ||
      read.descriptor.snapshotId !== row.snapshot_id ||
      read.descriptor.digest !== row.content_hash ||
      hashBytes(read.bytes) !== row.content_hash
    )
      return undefined;
    const parsed = EnvelopeSchema.safeParse(
      parseSafeJson(new TextDecoder().decode(read.bytes)),
    );
    if (
      !parsed.success ||
      parsed.data.logicalArtifactId !== row.logical_artifact_key
    )
      return undefined;
    envelopes.set(row.artifact_id, parsed.data);
  }
  const challenges = challengeRows.flatMap((row) => {
    const parsed = EnvelopeSchema.safeParse(envelopes.get(row.artifact_id));
    if (!parsed.success || parsed.data.payload.kind !== "blind_challenge")
      return [];
    const challengerId = z
      .enum(["market", "company", "financial", "risk"])
      .safeParse(row.logical_artifact_key.replace(/^challenge:/, ""));
    if (!challengerId.success) return [];
    const targetByChallenger = {
      market: "financial",
      company: "risk",
      financial: "company",
      risk: "market",
    } as const;
    return [
      {
        artifactId: row.artifact_id,
        challengerId: challengerId.data,
        targetDepartmentId: targetByChallenger[challengerId.data],
        payload: parsed.data.payload,
      },
    ];
  });
  const memos = memoRows.flatMap((row) => {
    const parsed = EnvelopeSchema.safeParse(envelopes.get(row.artifact_id));
    return parsed.success && parsed.data.payload.kind === "memo"
      ? [
          {
            artifactId: row.artifact_id,
            roleId: row.logical_artifact_key.replace(/^memo:/, ""),
            payload: parsed.data.payload,
          },
        ]
      : [];
  });
  const snapshotId = challengeRows[0]?.snapshot_id;
  return challenges.length === 4 &&
    memos.length === WORKFLOW_V1_SPECIALIST_IDS.length &&
    snapshotId !== undefined
    ? { challenges, memos, snapshotId }
    : undefined;
}

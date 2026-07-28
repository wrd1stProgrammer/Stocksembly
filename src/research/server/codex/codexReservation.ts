import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import {
  type AttemptId,
  AttemptIdSchema,
  type JobId,
  JobIdSchema,
  type RunId,
  RunIdSchema,
} from "../../domain/ids";
import { schemaDocument, sha256Value } from "./codexArtifacts";
import { CodexRunnerError } from "./codexErrors";
import type { CodexStage } from "./codexPolicy";

export type LaunchReservationKey = {
  readonly runId: RunId;
  readonly jobId: JobId;
  readonly attemptId: AttemptId;
  readonly ordinal: number;
};

export type LaunchFence = {
  readonly ownerId: string;
  readonly token: number;
};

export type LaunchReservationClaim = {
  readonly key: LaunchReservationKey;
  readonly fence: LaunchFence;
};

export type CommittedLaunchReservation = LaunchReservationKey & {
  readonly status: "spawn_reserved";
  readonly committed: true;
  readonly inputHash: string;
  readonly reservationFence: LaunchFence;
  readonly currentFence: LaunchFence;
};

export interface LaunchReservationReader {
  readonly readCommittedReservation: (
    key: LaunchReservationKey,
  ) => Promise<unknown>;
}

const FenceSchema = z
  .object({
    ownerId: z.string().min(1),
    token: z.number().int().positive(),
  })
  .strict();

const KeySchema = z
  .object({
    runId: RunIdSchema,
    jobId: JobIdSchema,
    attemptId: AttemptIdSchema,
    ordinal: z
      .number()
      .int()
      .positive()
      .max(CALL_BUDGET_POLICY.maxPhysicalLaunches),
  })
  .strict();

const ClaimSchema = z.object({ key: KeySchema, fence: FenceSchema }).strict();

const CommittedReservationSchema = KeySchema.extend({
  status: z.literal("spawn_reserved"),
  committed: z.literal(true),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  reservationFence: FenceSchema,
  currentFence: FenceSchema,
}).strict();

function sameFence(left: LaunchFence, right: LaunchFence): boolean {
  return left.ownerId === right.ownerId && left.token === right.token;
}

export function codexInputHash(input: {
  readonly stage: CodexStage;
  readonly prompt: string;
  readonly outputSchema: z.ZodType;
}): string {
  return sha256Value({
    stage: input.stage,
    prompt: input.prompt,
    schema: schemaDocument(input.outputSchema),
  });
}

export async function verifyLaunchReservation(
  claimValue: LaunchReservationClaim,
  reader: LaunchReservationReader,
  expectedInputHash: string,
): Promise<CommittedLaunchReservation> {
  const claim = ClaimSchema.safeParse(claimValue);
  if (!claim.success) throw new CodexRunnerError("policy_violation");
  let storedValue: unknown;
  try {
    storedValue = await reader.readCommittedReservation(claim.data.key);
  } catch (error) {
    if (error instanceof CodexRunnerError) throw error;
    throw new CodexRunnerError("policy_violation");
  }
  const stored = CommittedReservationSchema.safeParse(storedValue);
  if (
    !stored.success ||
    stored.data.runId !== claim.data.key.runId ||
    stored.data.jobId !== claim.data.key.jobId ||
    stored.data.attemptId !== claim.data.key.attemptId ||
    stored.data.ordinal !== claim.data.key.ordinal ||
    stored.data.inputHash !== expectedInputHash ||
    !sameFence(stored.data.reservationFence, claim.data.fence) ||
    !sameFence(stored.data.currentFence, claim.data.fence)
  )
    throw new CodexRunnerError("policy_violation");
  return Object.freeze(stored.data);
}

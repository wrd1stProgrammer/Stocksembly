import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
} from "../../research/domain/ids";
import {
  type CommittedLaunchReservation,
  codexInputHash,
  type LaunchReservationClaim,
  type LaunchReservationReader,
} from "../../research/server/codex/codexReservation";
import {
  CodexRunnerError,
  createCodexPort,
} from "../../research/server/codex/codexRunner";
import { type BriefingModelInput, briefingPrompt } from "./briefingPrompt";
import {
  type BriefingDraft,
  BriefingDraftSchema,
} from "./briefingSynthesisSchema";

export type BriefingModelAttempt<Candidate> = {
  readonly attemptDir: string;
  readonly reservation: LaunchReservationClaim;
  readonly committed: CommittedLaunchReservation;
  readonly prompt: string;
  readonly outputSchema: z.ZodType<Candidate>;
};

export type BriefingModelRetryInput<Candidate> = {
  readonly prompt: string;
  readonly outputSchema: z.ZodType<Candidate>;
  readonly runAttempt: (
    attempt: BriefingModelAttempt<Candidate>,
  ) => Promise<Candidate>;
  readonly createAttemptDir?: () => Promise<string>;
  readonly cleanupAttemptDir?: (attemptDir: string) => Promise<void>;
};

const createBriefingAttemptDir = async (): Promise<string> =>
  await mkdtemp(join(await realpath(tmpdir()), "stocksembly-briefing-"));

const cleanupBriefingAttemptDir = async (attemptDir: string): Promise<void> => {
  await rm(attemptDir, { recursive: true, force: true });
};

export async function runBriefingModelWithRetry<Candidate>(
  input: BriefingModelRetryInput<Candidate>,
): Promise<Candidate> {
  const createAttemptDir = input.createAttemptDir ?? createBriefingAttemptDir;
  const cleanupAttemptDir =
    input.cleanupAttemptDir ?? cleanupBriefingAttemptDir;
  const inputHash = codexInputHash({
    stage: "department_consolidation",
    prompt: input.prompt,
    outputSchema: input.outputSchema,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const key = {
      runId: RunIdSchema.parse(randomUUID()),
      jobId: JobIdSchema.parse(randomUUID()),
      attemptId: AttemptIdSchema.parse(randomUUID()),
      ordinal: 1,
    };
    const fence = {
      ownerId: `briefing:${process.pid}:${randomUUID()}`,
      token: 1,
    };
    const reservation: LaunchReservationClaim = { key, fence };
    const committed: CommittedLaunchReservation = {
      ...key,
      status: "spawn_reserved",
      committed: true,
      inputHash,
      reservationFence: fence,
      currentFence: fence,
    };
    const attemptDir = await createAttemptDir();
    try {
      return await input.runAttempt({
        attemptDir,
        reservation,
        committed,
        prompt: input.prompt,
        outputSchema: input.outputSchema,
      });
    } catch (error) {
      if (
        !(error instanceof CodexRunnerError) ||
        error.code !== "output_invalid" ||
        attempt === 1
      )
        throw error;
    } finally {
      await cleanupAttemptDir(attemptDir);
    }
  }

  throw new CodexRunnerError("output_invalid");
}

export async function generateBriefingDraft(
  input: BriefingModelInput,
): Promise<BriefingDraft> {
  const prompt = briefingPrompt(input);
  return await runBriefingModelWithRetry({
    prompt,
    outputSchema: BriefingDraftSchema,
    runAttempt: async ({ attemptDir, reservation, committed }) => {
      const reservations: LaunchReservationReader = {
        readCommittedReservation: async (candidate) =>
          candidate.runId === reservation.key.runId &&
          candidate.jobId === reservation.key.jobId &&
          candidate.attemptId === reservation.key.attemptId &&
          candidate.ordinal === reservation.key.ordinal
            ? committed
            : undefined,
      };
      const result = await createCodexPort(reservations).run({
        attemptDir,
        reservation,
        stage: "department_consolidation",
        prompt,
        outputSchema: BriefingDraftSchema,
      });
      return result.candidate;
    },
  });
}

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
} from "../src/research/domain/ids";
import {
  type CodexRunInput,
  codexInputHash,
  createCodexPort,
  runProductionCodexWorkerAdmission,
} from "../src/research/server/codex/codexRunner";
import { recordSuccessfulRunnerEvidence } from "../src/research/workflow/agentRunnerLaunchEvidence";

if (process.env["STOCKSEMBLY_RESEARCH_PROVIDER"] !== "openai")
  throw new Error(
    "This smoke test requires STOCKSEMBLY_RESEARCH_PROVIDER=openai",
  );
const directory = await mkdtemp(join(tmpdir(), "stocksembly-api-smoke-"));
try {
  await runProductionCodexWorkerAdmission();
  const key = {
    runId: RunIdSchema.parse(randomUUID()),
    jobId: JobIdSchema.parse(randomUUID()),
    attemptId: AttemptIdSchema.parse(randomUUID()),
    ordinal: 1,
  };
  const fence = { ownerId: "api-smoke", token: 1 };
  const schema = z
    .object({ summary: z.string().min(1), supported: z.literal(true) })
    .strict();
  const input: CodexRunInput<z.infer<typeof schema>> = {
    attemptDir: directory,
    reservation: { key, fence },
    stage: "semantic_audit",
    prompt:
      "Evidence: revenue was 100 units and is now 120 units. Claim: revenue grew 20%. Verify only this arithmetic. Return a short summary and supported=true as JSON.",
    outputSchema: schema,
  };
  const result = await createCodexPort({
    readCommittedReservation: async () => ({
      ...key,
      status: "spawn_reserved",
      committed: true,
      inputHash: codexInputHash(input),
      reservationFence: fence,
      currentFence: fence,
    }),
  }).run(input);
  let recorded = false;
  const accepted = await recordSuccessfulRunnerEvidence(
    {
      recordRunnerEvidence: async () => {
        recorded = true;
        return true;
      },
    },
    {
      ...key,
      ...fence,
      stage: "semantic_audit",
      promptHash: "a".repeat(64),
      inputHash: codexInputHash(input),
      now: new Date().toISOString(),
    },
    result.evidence,
  );
  if (!accepted || !recorded) throw new Error("API evidence was rejected");
  console.log(
    JSON.stringify({
      provider: "openai",
      model: result.evidence.model,
      runner: result.evidence.binaryVersion,
      candidate: result.candidate,
      evidenceAccepted: accepted,
      tokens: result.evidence.tokenUsage,
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

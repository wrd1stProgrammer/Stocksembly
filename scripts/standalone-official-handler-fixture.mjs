import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ProcessVerificationError } from "./standalone-process.mjs";

const PromptSchema = z.object({
  request: z.object({
    role: z.object({ id: z.literal("market_news") }).passthrough(),
    ids: z.object({ claimId: z.string().uuid() }).passthrough(),
  }),
  sourceArtifactIds: z.array(z.string().uuid()).min(1),
});

const hash = (value) => value.repeat(64);

const deterministicCodex = {
  id: "isolated-codex-cli",
  kind: "real",
  run: async (input) => {
    const prompt = PromptSchema.parse(JSON.parse(input.prompt));
    const candidate = input.outputSchema.parse({
      kind: "memo",
      sourceArtifactIds: prompt.sourceArtifactIds,
      positions: [
        {
          claimId: prompt.request.ids.claimId,
          stance: "supports",
          publicSummary: {
            en: "Packaged worker durable finding",
            ko: "패키지 워커 지속 결과",
          },
          evidenceArtifactIds: prompt.sourceArtifactIds,
        },
      ],
      dissent: [],
      unknowns: [],
    });
    return {
      candidate,
      evidence: {
        ordinal: input.reservation.key.ordinal,
        stage: "memo",
        binaryVersion: "codex-cli 0.145.0-alpha.30",
        binaryHash:
          "9de41fd67ac24873dd7852160536cff004633f76f224fed602654457da27db02",
        originDevice: "1",
        originInode: "1",
        linkDevice: "1",
        linkInode: "1",
        profileHash: hash("a"),
        environmentHash: hash("b"),
        argvHash: hash("c"),
        schemaHash: hash("d"),
        eventTypes: ["thread.started", "item.completed", "turn.completed"],
        exitCode: 0,
        toolEventCount: 0,
        cleanup: "complete",
      },
    };
  },
};

export const executePackagedOfficialJob = async (packageRoot, dataRoot) => {
  const moduleUrl = pathToFileURL(
    join(packageRoot, "research-worker/leaseWorker.js"),
  ).href;
  const worker = await import(moduleUrl);
  if (
    typeof worker.createRuntimeAttemptHandler !== "function" ||
    typeof worker.runLeaseWorkerProcess !== "function"
  )
    throw new ProcessVerificationError(
      "PACKAGED_HANDLER_UNAVAILABLE",
      "The packaged official handler injection seam is unavailable",
    );
  const runtime = await worker.createRuntimeAttemptHandler(
    {
      dataDirectory: dataRoot,
      databasePath: join(dataRoot, "research.sqlite"),
      migrationsDirectory: join(packageRoot, "migrations"),
      ownerId: "standalone-verifier-worker",
    },
    { codex: deterministicCodex, now: () => new Date().toISOString() },
  );
  try {
    await worker.runLeaseWorkerProcess(
      [
        "--database",
        join(dataRoot, "research.sqlite"),
        "--owner",
        "standalone-verifier-worker",
        "--verification-outcome",
        "accepted",
        "--drain",
      ],
      runtime.handler,
    );
  } finally {
    await runtime.close();
  }
};

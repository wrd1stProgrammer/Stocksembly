import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../domain/ids";
import {
  type CodexRunInput,
  codexInputHash,
  createCodexPort,
} from "./codexRunner";
import {
  FakeLaunchReservationStore,
  makeCodexTempDirectory,
} from "./codexRunnerTestSupport";

const LiveProbeSchema = z.object({ message: z.literal("PONG") }).strict();

export function registerLiveProbeTest(): void {
  describe("live protected Codex probe", () => {
    it("returns schema-valid PONG without tool events", async () => {
      // Given
      vi.stubEnv("LANG", "en_US.UTF-8");
      vi.stubEnv("LC_ALL", "en_US.UTF-8");
      const root = await makeCodexTempDirectory();
      const input: CodexRunInput<{ readonly message: "PONG" }> = {
        attemptDir: join(root.path, "live-attempt"),
        reservation: {
          key: {
            runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000011"),
            jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000012"),
            attemptId: AttemptIdSchema.parse(
              "00000000-0000-4000-8000-000000000013",
            ),
            ordinal: 1,
          },
          fence: { ownerId: "live-probe", token: 1 },
        },
        stage: "probe",
        prompt: 'Return exactly {"message":"PONG"}. Do not use tools.',
        outputSchema: LiveProbeSchema,
      };
      const reservations = new FakeLaunchReservationStore();
      reservations.commit({
        ...input.reservation.key,
        status: "spawn_reserved",
        committed: true,
        inputHash: codexInputHash(input),
        reservationFence: input.reservation.fence,
        currentFence: input.reservation.fence,
      });
      const port = createCodexPort(reservations);

      try {
        // When
        const result = await port.run(input);

        // Then
        expect(result.candidate).toEqual({ message: "PONG" });
        expect(result.evidence.exitCode).toBe(0);
        expect(result.evidence.toolEventCount).toBe(0);
        expect(result.evidence.cleanup).toBe("complete");
        expect(result.evidence.eventTypes).toContain("turn.completed");
        const evidenceDirectory = join(
          process.cwd(),
          ".omo/evidence/start-work/live-research-office/task-17",
        );
        await mkdir(evidenceDirectory, { recursive: true });
        await writeFile(
          join(evidenceDirectory, "live-probe-safe.json"),
          `${JSON.stringify(
            {
              scenario: "protected linked-binary PONG schema probe",
              invocation:
                "pnpm exec vitest run src/research/server/codex/codexRunner.test.ts",
              schemaValid: true,
              ...result.evidence,
            },
            null,
            2,
          )}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
      } finally {
        vi.unstubAllEnvs();
        await root.cleanup();
      }
    }, 90_000);
  });
}

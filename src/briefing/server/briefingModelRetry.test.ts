import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CodexRunnerError } from "../../research/server/codex/codexRunner";
import { runBriefingModelWithRetry } from "./briefingModelRunner";

const OutputSchema = z.object({ message: z.string() });

describe("briefing model output retry", () => {
  it("retries one output-invalid run with a fresh attempt identity and directory", async () => {
    const attempts: { readonly attemptDir: string; readonly runId: string }[] =
      [];
    const cleaned: string[] = [];
    const prompts: string[] = [];
    const schemas: unknown[] = [];
    let calls = 0;

    const result = await runBriefingModelWithRetry({
      prompt: "PROMPT",
      outputSchema: OutputSchema,
      createAttemptDir: async () => `/tmp/briefing-test-${calls + 1}`,
      cleanupAttemptDir: async (attemptDir) => {
        cleaned.push(attemptDir);
      },
      runAttempt: async ({ attemptDir, reservation, prompt, outputSchema }) => {
        calls += 1;
        attempts.push({ attemptDir, runId: reservation.key.runId });
        prompts.push(prompt);
        schemas.push(outputSchema);
        if (calls === 1) throw new CodexRunnerError("output_invalid");
        return { message: "ok" };
      },
    });

    expect(result).toEqual({ message: "ok" });
    expect(calls).toBe(2);
    expect(new Set(attempts.map(({ attemptDir }) => attemptDir)).size).toBe(2);
    expect(new Set(attempts.map(({ runId }) => runId)).size).toBe(2);
    expect(prompts).toEqual(["PROMPT", "PROMPT"]);
    expect(schemas[0]).toBe(schemas[1]);
    expect(cleaned).toEqual(attempts.map(({ attemptDir }) => attemptDir));
  });

  it("throws after the single allowed retry when both runs are output-invalid", async () => {
    const cleaned: string[] = [];
    let calls = 0;

    await expect(
      runBriefingModelWithRetry({
        prompt: "PROMPT",
        outputSchema: OutputSchema,
        createAttemptDir: async () => `/tmp/briefing-test-${calls + 1}`,
        cleanupAttemptDir: async (attemptDir) => {
          cleaned.push(attemptDir);
        },
        runAttempt: async () => {
          calls += 1;
          throw new CodexRunnerError("output_invalid");
        },
      }),
    ).rejects.toMatchObject({ code: "output_invalid" });

    expect(calls).toBe(2);
    expect(cleaned).toEqual(["/tmp/briefing-test-1", "/tmp/briefing-test-2"]);
  });

  it.each([new CodexRunnerError("process_failed"), new Error("plain failure")])(
    "does not retry non-output-invalid failures: %s",
    async (failure) => {
      let calls = 0;

      await expect(
        runBriefingModelWithRetry({
          prompt: "PROMPT",
          outputSchema: OutputSchema,
          createAttemptDir: async () => "/tmp/briefing-test-single",
          cleanupAttemptDir: async () => undefined,
          runAttempt: async () => {
            calls += 1;
            throw failure;
          },
        }),
      ).rejects.toBe(failure);

      expect(calls).toBe(1);
    },
  );
});

import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { LeaseEngineFixture } from "./leaseEngine.testSupport";
import type { AttemptOutcome } from "./leaseEngineTypes";

describe("recoverable worker interruption", () => {
  it.each(["returned", "thrown", "abort-error"] as const)(
    "resumes an interrupted research stage after restart when cancellation is %s",
    async (mode) => {
      // Given: an active stage interrupted by worker shutdown, not by its user.
      const fixture = new LeaseEngineFixture();
      const seed = fixture.seedResearchJob();
      const engine = fixture.openEngine("before-restart", {
        run: async (_attempt, signal): Promise<AttemptOutcome> => {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          if (mode === "thrown") throw new CodexRunnerError("cancelled");
          if (mode === "abort-error")
            throw new DOMException("aborted", "AbortError");
          return { kind: "incomplete", code: "cancelled" };
        },
      });
      const active = engine.poll();
      // When: the old worker exits and a new worker reopens the same database.
      await engine.shutdown();
      await active;
      fixture.clock.set("2026-07-22T00:01:00.000Z");
      const replacement = fixture.openEngine("after-restart");
      try {
        // Then: restart preserves the research and retries only its unfinished stage.
        expect(fixture.run(seed.runId)?.status).toBe("running");
        expect(fixture.job(seed.jobId).status).toBe("retry-wait");
        expect(await replacement.poll()).toMatchObject({
          kind: "handled",
          outcome: { kind: "accepted" },
        });
        expect(fixture.job(seed.jobId).status).toBe("succeeded");
        expect(fixture.eventCount(seed.runId, "run_failed")).toBe(0);
        expect(fixture.eventCount(seed.runId, "run_incomplete")).toBe(0);
      } finally {
        await replacement.shutdown();
        fixture.cleanup();
      }
    },
  );
});

import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { createLeaseEngineFixture } from "./leaseEngine.testSupport";

describe("research recovery budget", () => {
  it("preserves artifact repair capacity after transient provider attempts", async () => {
    const fixture = await createLeaseEngineFixture();
    const seed = await fixture.seedResearchJob();
    let attempts = 0;
    const engine = fixture.openEngine("recovery-budget", {
      run: async () => {
        attempts += 1;
        if (attempts <= 4) throw new CodexRunnerError("process_failed");
        if (attempts === 5) throw new CodexRunnerError("output_invalid");
        return { kind: "accepted" };
      },
    });
    try {
      for (let index = 0; index < 6; index += 1) {
        fixture.clock.set(`2026-07-22T0${index}:00:00.000Z`);
        await engine.poll();
      }
      expect((await fixture.job(seed.jobId)).status).toBe("succeeded");
      expect(
        (await fixture.budgets(seed.runId)).requestedReplacementCalls,
      ).toBe(11);
      expect(await fixture.launches(seed.runId)).toHaveLength(6);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });
  it("allows bounded recovery beyond 41 reservations and refuses reservation 66", async () => {
    const fixture = await createLeaseEngineFixture();
    const seed = await fixture.seedResearchJob();
    const engine = fixture.openEngine("physical-recovery-budget", {
      run: async () => {
        throw new CodexRunnerError("process_failed");
      },
    });
    try {
      for (let index = 0; index < 65; index += 1) {
        fixture.clock.set(new Date(Date.UTC(2026, 6, 22, index)).toISOString());
        await engine.poll();
      }
      expect(await fixture.launches(seed.runId)).toHaveLength(65);
      expect(await fixture.runStatus(seed.runId)).toBe("running");
      fixture.clock.set(new Date(Date.UTC(2026, 6, 22, 66)).toISOString());
      expect(await engine.poll()).toEqual({ kind: "incomplete" });
      expect(await fixture.launches(seed.runId)).toHaveLength(65);
      expect(await fixture.limitations(seed.runId)).toContain(
        "physical_launch_budget_exhausted",
      );
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });
  it("never resets the three-rewrite limit across transient attempts", async () => {
    const fixture = await createLeaseEngineFixture();
    const seed = await fixture.seedResearchJob();
    let attempts = 0;
    const engine = fixture.openEngine("logical-recovery-budget", {
      run: async () => {
        attempts += 1;
        throw new CodexRunnerError(
          attempts % 2 === 0 ? "process_failed" : "output_invalid",
        );
      },
    });
    try {
      for (let index = 0; index < 8; index += 1) {
        fixture.clock.set(new Date(Date.UTC(2026, 6, 22, index)).toISOString());
        await engine.poll();
      }
      expect(await fixture.launches(seed.runId)).toHaveLength(7);
      expect(await fixture.limitations(seed.runId)).toContain(
        "logical_artifact_replacement_exhausted",
      );
      expect(
        (await fixture.budgets(seed.runId)).requestedReplacementCalls,
      ).toBe(9);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });
});

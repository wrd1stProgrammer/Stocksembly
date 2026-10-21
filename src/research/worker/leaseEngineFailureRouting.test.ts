import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { routeRunnerFailure } from "./leaseEngineFailureRouting";

describe("runner failure diagnostics", () => {
  it("identifies API persistence failures without calling them Codex failures or model repairs", () => {
    expect(
      routeRunnerFailure(
        new CodexRunnerError("process_failed", {
          executionBackend: "api",
          phase: "web_evidence_registration",
        }),
        { now: "2026-08-01T00:00:00.000Z", failures: 0, random: () => 0.5 },
      ),
    ).toMatchObject({
      kind: "transient",
      code: "openai_process_failed",
      runner: { phase: "web_evidence_registration" },
    });
  });
  it("retains only the stable reservation phase for a policy violation", () => {
    const outcome = routeRunnerFailure(
      new CodexRunnerError("policy_violation", {
        phase: "reservation_validation",
      }),
      {
        now: "2026-08-01T00:00:00.000Z",
        failures: 0,
        random: () => 0.5,
      },
    );

    expect(outcome).toEqual({
      kind: "permanent",
      code: "codex_policy_violation",
      runner: { phase: "reservation_validation" },
    });
  });
});

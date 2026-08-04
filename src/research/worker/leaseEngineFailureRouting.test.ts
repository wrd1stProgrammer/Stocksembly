import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { routeRunnerFailure } from "./leaseEngineFailureRouting";

describe("runner failure diagnostics", () => {
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

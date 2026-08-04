import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { assertHostPolicy } from "../server/codex/codexPlatform";
import { prepareAdmittedWorkerRuntime } from "./leaseWorker";

describe("worker Codex admission", () => {
  it("fails closed before runtime, lease, claim, or budget consumption for an invalid locale", async () => {
    let prepares = 0;
    let leases = 0;
    let claims = 0;
    let remainingBudget = 24;

    const action = prepareAdmittedWorkerRuntime({
      admit: async () =>
        assertHostPolicy(
          { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NODE_ENV: "test" },
          "en_US.UTF-8",
        ),
      prepare: async () => {
        prepares += 1;
        return {};
      },
      acquire: async () => {
        leases += 1;
        claims += 1;
        remainingBudget -= 1;
        return {};
      },
    });

    await expect(action).rejects.toBeInstanceOf(CodexRunnerError);
    expect({ prepares, leases, claims, remainingBudget }).toEqual({
      prepares: 0,
      leases: 0,
      claims: 0,
      remainingBudget: 24,
    });
  });
});

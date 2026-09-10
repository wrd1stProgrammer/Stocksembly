import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AttemptIdSchema } from "../../domain/ids";
import { routeRunnerFailure } from "../../worker/leaseEngineFailureRouting";
import { CodexRunnerError } from "./codexErrors";
import { createCodexHybridPool } from "./codexHybridPool";
import {
  admitHybridCodexWorker,
  createCodexAuthenticationCircuit,
  createHybridCodexPort,
} from "./codexHybridRouting";
import { createCodexPortForTesting } from "./codexRunner";
import {
  committedReservation,
  makePlatform,
  runInput,
} from "./codexRunnerPortTestSupport";
import { CodexIsolationError } from "./readiness";

describe("hybrid Codex routing", () => {
  it("uses a fresh reserved API attempt after a launched Pro authentication failure", async () => {
    const fixture = await makePlatform();
    try {
      const apiAuthPath = join(fixture.root.path, "api-auth.json");
      await writeFile(
        apiAuthPath,
        JSON.stringify({ OPENAI_API_KEY: "offline-fixture", tokens: null }),
        { mode: 0o600 },
      );
      const authentication = createCodexAuthenticationCircuit(
        () => "login-one",
      );
      const pool = createCodexHybridPool({
        subscriptionAvailable: authentication.available,
        apiEnabled: () => true,
      });
      let proCalls = 0;
      const pro = createCodexPortForTesting(
        {
          ...fixture.platform,
          authentication: "subscription",
          async runCodex() {
            proCalls++;
            return {
              exitCode: 1,
              stdout: [
                Buffer.from(
                  '{"type":"error","message":"Your refresh token has expired"}\n',
                ),
              ],
              stderrBytes: 0,
            };
          },
        },
        fixture.reservations,
      );
      const api = createCodexPortForTesting(
        { ...fixture.platform, authentication: "api", authPath: apiAuthPath },
        fixture.reservations,
      );
      const port = createHybridCodexPort({
        pool,
        authentication,
        apiEnabled: () => true,
        port: (backend) => (backend === "api" ? api : pro),
      });
      const input = runInput(fixture.attemptDir);
      let failed: unknown;
      try {
        await port.run(input);
      } catch (error) {
        failed = error;
      }
      expect(failed).toBeInstanceOf(CodexRunnerError);
      if (!(failed instanceof CodexRunnerError))
        throw new Error("expected runner failure");
      expect(
        routeRunnerFailure(failed, {
          now: "2026-09-11T00:00:00.000Z",
          failures: 8,
          random: () => 0.5,
        }),
      ).toMatchObject({
        kind: "transient",
        code: "codex_auth_fallback_to_api",
      });
      expect(
        fixture.invocations.filter((call) => call.argv.includes("exec")),
      ).toHaveLength(0);
      const retry = {
        ...input,
        attemptDir: join(fixture.root.path, "retry"),
        reservation: {
          ...input.reservation,
          key: {
            ...input.reservation.key,
            attemptId: AttemptIdSchema.parse(
              "00000000-0000-4000-8000-000000000004",
            ),
            ordinal: 2,
          },
        },
      };
      fixture.reservations.commit(committedReservation(retry));
      const result = await port.run(retry);
      expect(result.candidate).toEqual({ message: "PONG" });
      expect(result.evidence.executionBackend).toBe("api");
      expect(result.evidence.ordinal).toBe(2);
      expect(proCalls).toBe(1);
    } finally {
      await fixture.root.cleanup();
    }
  });

  it("switches a pre-launch login failure to API without launching the Pro task", async () => {
    const fixture = await makePlatform();
    try {
      const authentication = createCodexAuthenticationCircuit(
        () => "login-one",
      );
      const pool = createCodexHybridPool({
        subscriptionAvailable: authentication.available,
        apiEnabled: () => true,
      });
      let proCalls = 0;
      const port = createHybridCodexPort({
        pool,
        authentication,
        apiEnabled: () => true,
        port: (backend) =>
          backend === "api"
            ? createCodexPortForTesting(fixture.platform, fixture.reservations)
            : {
                id: "isolated-codex-cli",
                kind: "real",
                async run() {
                  proCalls++;
                  throw new CodexIsolationError("login", "runtime_prepare");
                },
              },
      });
      expect((await port.run(runInput(fixture.attemptDir))).candidate).toEqual({
        message: "PONG",
      });
      expect(proCalls).toBe(1);
      expect(authentication.available()).toBe(false);
    } finally {
      await fixture.root.cleanup();
    }
  });

  it("falls back at startup, recovers after login file changes, and leaves non-auth failures intact", async () => {
    let fingerprint = "old";
    const authentication = createCodexAuthenticationCircuit(() => fingerprint);
    const backends: string[] = [];
    await admitHybridCodexWorker({
      authentication,
      apiEnabled: () => true,
      async probe(backend) {
        backends.push(backend);
        if (backend === "subscription") throw new CodexIsolationError("login");
      },
    });
    expect(backends).toEqual(["subscription", "api"]);
    expect(authentication.available()).toBe(false);
    fingerprint = "new";
    expect(authentication.available()).toBe(true);
    const failure = new CodexIsolationError("binary");
    await expect(
      admitHybridCodexWorker({
        authentication,
        apiEnabled: () => true,
        async probe() {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });

  it("does not loop when API credentials also fail or API is disabled", async () => {
    const authentication = createCodexAuthenticationCircuit(() => "old");
    let calls = 0;
    const failure = new CodexRunnerError("auth_unavailable");
    await expect(
      admitHybridCodexWorker({
        authentication,
        apiEnabled: () => true,
        async probe() {
          calls++;
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(calls).toBe(2);
    expect(
      routeRunnerFailure(failure, {
        now: "2026-09-11T00:00:00.000Z",
        failures: 0,
        random: () => 0.5,
      }).kind,
    ).toBe("permanent");
    calls = 0;
    await expect(
      admitHybridCodexWorker({
        authentication,
        apiEnabled: () => false,
        async probe() {
          calls++;
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
  });
});

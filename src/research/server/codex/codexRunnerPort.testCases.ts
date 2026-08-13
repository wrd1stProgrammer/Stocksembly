import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodexArgv,
  CODEX_RUNTIME_POLICY,
  CODEX_STAGES,
} from "./codexPolicy";
import { createCodexPortForTesting } from "./codexRunner";
import {
  committedReservation,
  environmentValue,
  FENCE,
  makePlatform,
  RESERVATION_KEY,
  runInput,
} from "./codexRunnerPortTestSupport";
import { FakeLaunchReservationStore } from "./codexRunnerTestSupport";
import type { SpawnInvocation } from "./codexTypes";

export function registerPortTests(): void {
  describe("isolated Codex port", () => {
    it("builds the reserved model and reasoning argv for every stage", () => {
      // Given
      const expected = {
        memo: "medium",
        department_consolidation: "medium",
        blind_challenge: "medium",
        owner_response_ballot: "medium",
        follow_up: "medium",
        semantic_audit: "medium",
        chair_synthesis: "medium",
        qa: "low",
        probe: "medium",
      } as const;

      // When
      const launches = CODEX_STAGES.map((stage) => ({
        stage,
        argv: buildCodexArgv("/tmp/schema.json", stage),
      }));

      // Then
      for (const launch of launches) {
        expect(CODEX_RUNTIME_POLICY.model).toBe("gpt-5.6-terra");
        expect(launch.argv).toContain(
          `model_reasoning_effort="${expected[launch.stage]}"`,
        );
        expect(launch.argv.join(" ")).not.toContain("xhigh");
      }
    });

    it("allows only the QA advanced runtime to select Sol with light reasoning", () => {
      // When
      const argv = buildCodexArgv("/tmp/schema.json", "qa", {
        model: "gpt-5.6-sol",
        reasoning: "low",
      });

      // Then
      expect(argv).toContain("gpt-5.6-sol");
      expect(argv).toContain('model_reasoning_effort="low"');
    });

    it("executes only the protected link after a committed ordinal", async () => {
      // Given
      const fixture = await makePlatform();
      const port = createCodexPortForTesting(
        fixture.platform,
        fixture.reservations,
      );

      // When
      const result = await port.run(runInput(fixture.attemptDir));

      // Then
      expect(result.candidate).toEqual({ message: "PONG" });
      expect(fixture.invocations).toHaveLength(2);
      const execution = fixture.invocations[1];
      expect(execution?.executable).toBe(fixture.platform.pins.sandboxExecPath);
      expect(execution?.argv[0]).toBe("-p");
      expect(execution?.argv[2]).toBe(join(fixture.attemptDir, "codex-bin"));
      expect(execution?.argv).not.toContain(fixture.platform.pins.originPath);
      expect(execution?.argv).toContain("--ignore-user-config");
      expect(execution?.argv).toContain("--ignore-rules");
      expect(execution?.stdin).toBe("PROMPT_SENTINEL_DO_NOT_PERSIST");
      expect(execution?.argv).not.toContain("PROMPT_SENTINEL_DO_NOT_PERSIST");
      await fixture.root.cleanup();
    });

    it("executes the protected link directly for the Linux runtime mode", async () => {
      // Given
      const fixture = await makePlatform();
      const platform = Object.freeze({
        ...fixture.platform,
        executionMode: "direct" as const,
      });
      const port = createCodexPortForTesting(platform, fixture.reservations);

      // When
      const result = await port.run(runInput(fixture.attemptDir));

      // Then
      expect(result.candidate).toEqual({ message: "PONG" });
      expect(fixture.invocations).toHaveLength(2);
      expect(fixture.invocations[0]).toMatchObject({
        executable: join(fixture.attemptDir, "codex-bin"),
        argv: ["--version"],
      });
      expect(fixture.invocations[1]?.executable).toBe(
        join(fixture.attemptDir, "codex-bin"),
      );
      expect(fixture.invocations[1]?.argv[0]).toBe("--ask-for-approval");
      expect(fixture.invocations[1]?.argv).not.toContain("-p");
      await fixture.root.cleanup();
    });

    it("persists only schema, safe manifests, and the final candidate", async () => {
      // Given
      const fixture = await makePlatform();
      const port = createCodexPortForTesting(
        fixture.platform,
        fixture.reservations,
      );

      // When
      await port.run(runInput(fixture.attemptDir));

      // Then
      expect((await readdir(fixture.attemptDir)).sort()).toEqual([
        "codex-bin",
        "final-candidate.json",
        "launch-manifest.json",
        "lifecycle.json",
        "output-schema.json",
        "tool-transcript.json",
      ]);
      const persisted = await Promise.all(
        (await readdir(fixture.attemptDir))
          .filter((name) => name.endsWith(".json"))
          .map((name) => readFile(join(fixture.attemptDir, name), "utf8")),
      );
      expect(persisted.join("\n")).not.toContain(
        "PROMPT_SENTINEL_DO_NOT_PERSIST",
      );
      expect(persisted.join("\n")).not.toContain("credential-sentinel");
      const executionEnvironment = fixture.invocations[1]?.environment;
      const runtimeHome =
        executionEnvironment === undefined
          ? undefined
          : environmentValue(executionEnvironment, "CODEX_HOME");
      expect(runtimeHome).toBeDefined();
      if (runtimeHome !== undefined)
        await expect(access(runtimeHome)).rejects.toBeDefined();
      await fixture.root.cleanup();
    });

    it("persists redacted numeric diagnostics for a failed Codex process", async () => {
      // Given
      const fixture = await makePlatform();
      const platform = {
        ...fixture.platform,
        runCodex: async () => ({
          exitCode: 17,
          signal: "SIGTERM" as const,
          stdout: [Buffer.from("SECRET_OUTPUT_MUST_NOT_PERSIST")],
          stdoutBytes: 30,
          stderrBytes: 41,
          durationMs: 73,
        }),
      };
      const port = createCodexPortForTesting(platform, fixture.reservations);

      // When
      await expect(
        port.run(runInput(fixture.attemptDir)),
      ).rejects.toMatchObject({
        code: "process_failed",
        process: {
          exitCode: 17,
          signal: "SIGTERM",
          stdoutBytes: 30,
          stderrBytes: 41,
          durationMs: 73,
        },
      });

      // Then
      const lifecycle = await readFile(
        join(fixture.attemptDir, "lifecycle.json"),
        "utf8",
      );
      expect(JSON.parse(lifecycle)).toMatchObject({
        runId: RESERVATION_KEY.runId,
        jobId: RESERVATION_KEY.jobId,
        attemptId: RESERVATION_KEY.attemptId,
        ordinal: RESERVATION_KEY.ordinal,
        failureClass: "process_failed",
        process: {
          exitCode: 17,
          signal: "SIGTERM",
          stdoutBytes: 30,
          stderrBytes: 41,
          durationMs: 73,
        },
      });
      expect(lifecycle).not.toContain("SECRET_OUTPUT_MUST_NOT_PERSIST");
      await fixture.root.cleanup();
    });

    it("classifies rejected structured-output schemas without retrying them as provider outages", async () => {
      const fixture = await makePlatform();
      const platform = {
        ...fixture.platform,
        runCodex: async () => ({
          exitCode: 1,
          stdout: [
            Buffer.from(
              '{"type":"turn.failed","error":{"message":"invalid_json_schema: oneOf is not permitted in text.format.schema"}}\n',
            ),
          ],
          stderrBytes: 0,
        }),
      };
      const port = createCodexPortForTesting(platform, fixture.reservations);

      await expect(
        port.run(runInput(fixture.attemptDir)),
      ).rejects.toMatchObject({ code: "schema_invalid" });
      const lifecycle = JSON.parse(
        await readFile(join(fixture.attemptDir, "lifecycle.json"), "utf8"),
      ) as { readonly failureClass: string };
      expect(lifecycle.failureClass).toBe("schema_invalid");
      await fixture.root.cleanup();
    });

    it("does not link or spawn without a committed durable ordinal", async () => {
      // Given
      const fixture = await makePlatform();
      const port = createCodexPortForTesting(
        fixture.platform,
        fixture.reservations,
      );
      const input = {
        ...runInput(fixture.attemptDir),
        reservation: {
          key: { ...RESERVATION_KEY, ordinal: 0 },
          fence: FENCE,
        },
      };

      // When
      const action = port.run(input);

      // Then
      await expect(action).rejects.toMatchObject({ code: "policy_violation" });
      expect(fixture.invocations).toHaveLength(0);
      await expect(access(fixture.attemptDir)).rejects.toBeDefined();
      await fixture.root.cleanup();
    });

    it("rejects a forged ordinal without a durable reservation", async () => {
      // Given
      const fixture = await makePlatform();
      const port = createCodexPortForTesting(
        fixture.platform,
        new FakeLaunchReservationStore(),
      );

      try {
        // When
        const action = port.run(runInput(fixture.attemptDir));

        // Then
        await expect(action).rejects.toMatchObject({
          code: "policy_violation",
        });
        expect(fixture.invocations).toHaveLength(0);
      } finally {
        await fixture.root.cleanup();
      }
    });

    it("rejects a stale reservation fence before filesystem or process work", async () => {
      // Given
      const fixture = await makePlatform();
      const input = runInput(fixture.attemptDir);
      const reservations = new FakeLaunchReservationStore();
      reservations.commit({
        ...committedReservation(input),
        currentFence: { ...FENCE, token: FENCE.token + 1 },
      });
      const port = createCodexPortForTesting(fixture.platform, reservations);

      try {
        // When
        const action = port.run(input);

        // Then
        await expect(action).rejects.toMatchObject({
          code: "policy_violation",
        });
        expect(fixture.invocations).toHaveLength(0);
        await expect(access(fixture.attemptDir)).rejects.toBeDefined();
      } finally {
        await fixture.root.cleanup();
      }
    });

    it("rejects an input-binding mismatch before filesystem or process work", async () => {
      // Given
      const fixture = await makePlatform();
      const port = createCodexPortForTesting(
        fixture.platform,
        fixture.reservations,
      );
      const input = {
        ...runInput(fixture.attemptDir),
        prompt: "A_DIFFERENT_BOUND_INPUT",
      };

      try {
        // When
        const action = port.run(input);

        // Then
        await expect(action).rejects.toMatchObject({
          code: "policy_violation",
        });
        expect(fixture.invocations).toHaveLength(0);
        await expect(access(fixture.attemptDir)).rejects.toBeDefined();
      } finally {
        await fixture.root.cleanup();
      }
    });

    it("writes and fsyncs the launch manifest before the version child", async () => {
      // Given
      const fixture = await makePlatform();
      let manifestAtVersion: unknown;
      const platform = Object.freeze({
        ...fixture.platform,
        async runVersion(invocation: SpawnInvocation) {
          manifestAtVersion = JSON.parse(
            await readFile(
              join(invocation.cwd, "launch-manifest.json"),
              "utf8",
            ),
          );
          return await fixture.platform.runVersion(invocation);
        },
      });
      const port = createCodexPortForTesting(platform, fixture.reservations);

      try {
        // When
        const action = port.run(runInput(fixture.attemptDir));

        // Then
        await expect(action).resolves.toMatchObject({
          candidate: { message: "PONG" },
        });
        expect(manifestAtVersion).toMatchObject({
          model: "gpt-5.6-terra",
          reasoning: "medium",
          browsingPolicy: "disabled",
          toolTranscriptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          plannedBinaryVersion: "codex-cli test-v1",
          binaryHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          originHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          linkHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          versionPreflightArgvHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          argvHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          profileHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          environmentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
      } finally {
        await fixture.root.cleanup();
      }
    });

    it("rejects host overrides before link or spawn", async () => {
      // Given
      const fixture = await makePlatform();
      const platform = Object.freeze({
        ...fixture.platform,
        hostEnvironment: {
          ...fixture.platform.hostEnvironment,
          STOCKSEMBLY_CODEX_BINARY: "/tmp/substitute",
        },
      });
      const port = createCodexPortForTesting(platform, fixture.reservations);

      // When
      const action = port.run(runInput(fixture.attemptDir));

      // Then
      await expect(action).rejects.toMatchObject({ code: "policy_violation" });
      expect(fixture.invocations).toHaveLength(0);
      await fixture.root.cleanup();
    });
  });
}

import { describe, expect, it } from "vitest";
import {
  buildChildEnvironment,
  buildCodexArgv,
  CODEX_DISABLED_FEATURES,
  CODEX_RUNTIME_POLICY,
} from "./codexRunner";
import { registerJsonlTests } from "./codexRunnerJsonl.testCases";
import { registerLiveProbeTest } from "./codexRunnerLive.testCases";
import { registerOriginTests } from "./codexRunnerOrigin.testCases";
import { registerPortTests } from "./codexRunnerPort.testCases";
import { registerProcessTests } from "./codexRunnerProcess.testCases";
import { registerSandboxTests } from "./codexRunnerSandbox.testCases";

describe("isolated Codex runner", () => {
  it("uses activity liveness instead of a short total model deadline", () => {
    // Given
    const policy = CODEX_RUNTIME_POLICY;

    // When
    const timeout = policy.timeoutMs;

    // Then
    expect(timeout).toBeUndefined();
    expect(policy.inactivityTimeoutMs).toBe(10 * 60_000);
  });

  it("builds the locked argv when a launch is schema-bound", () => {
    // Given
    const schemaPath = "/attempt/output-schema.json";

    // When
    const argv = buildCodexArgv(schemaPath, "memo");

    // Then
    expect(argv).toEqual([
      "--ask-for-approval",
      "never",
      "exec",
      "--ignore-user-config",
      "--ignore-rules",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--strict-config",
      "--skip-git-repo-check",
      "--json",
      "--output-schema",
      schemaPath,
      "--color",
      "never",
      "--model",
      CODEX_RUNTIME_POLICY.model,
      "-c",
      `model_reasoning_effort="${CODEX_RUNTIME_POLICY.reasoningByStage.memo}"`,
      "-c",
      'shell_environment_policy.inherit="none"',
      "-c",
      "shell_environment_policy.set={}",
      "-c",
      "mcp_servers={}",
      "-c",
      'web_search="live"',
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
      "-",
    ]);
    expect(argv.join("\n")).not.toMatch(
      /model_provider|model_providers|supports_websockets|respect_system_proxy/u,
    );
  });

  it("enables audited web only for source gathering and intent-routed questions", () => {
    // Given
    const allowed = ["memo", "qa"] as const;
    const forbidden = [
      "department_consolidation",
      "blind_challenge",
      "owner_response_ballot",
      "follow_up",
      "semantic_audit",
      "chair_synthesis",
      "probe",
    ] as const;

    // When / Then
    for (const stage of allowed) {
      expect(CODEX_RUNTIME_POLICY.browsingByStage[stage]).toBe("audited_web");
      expect(buildCodexArgv("/attempt/schema.json", stage)).toContain(
        'web_search="live"',
      );
    }
    for (const stage of forbidden) {
      expect(CODEX_RUNTIME_POLICY.browsingByStage[stage]).toBe("disabled");
      const argv = buildCodexArgv("/attempt/schema.json", stage);
      expect(argv).toContain('web_search="disabled"');
      expect(argv).not.toContain("web_search_request");
      expect(argv.join("\n")).not.toMatch(
        /model_provider|model_providers|respect_system_proxy/u,
      );
    }
  });

  it("constructs an exact environment without inherited entries", () => {
    // Given
    const home = "/attempt/codex-home";
    const temp = "/attempt/tmp";

    // When
    const environment = buildChildEnvironment(home, temp);

    // Then
    expect(environment).toEqual({
      CODEX_HOME: home,
      HOME: "/attempt/home",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      NO_COLOR: "1",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      SSL_CERT_FILE: "/etc/ssl/cert.pem",
      TMPDIR: temp,
    });
  });
});

registerOriginTests();
registerJsonlTests();
registerProcessTests();
registerSandboxTests();
registerPortTests();
registerLiveProbeTest();

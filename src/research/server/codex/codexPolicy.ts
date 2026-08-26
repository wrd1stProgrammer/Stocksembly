export const CODEX_STAGES = [
  "memo",
  "department_consolidation",
  "blind_challenge",
  "owner_response_ballot",
  "follow_up",
  "semantic_audit",
  "chair_synthesis",
  "qa",
  "probe",
] as const;

export type CodexStage = (typeof CODEX_STAGES)[number];
export type AgentResearchStage = Exclude<CodexStage, "qa" | "probe">;
export type AgentResearchModel = "gpt-5.6-terra" | "gpt-5.6-luna";
export type AgentResearchReasoning = "low" | "medium";
export type CodexModel = "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";
export type CodexReasoning = "low" | "medium" | "high";
export type CodexBrowsingPolicy = "disabled" | "audited_web";
export type CodexRuntimeOverride = {
  readonly model: CodexModel;
  readonly reasoning: CodexReasoning;
};

export const QA_ADVANCED_RUNTIME = Object.freeze({
  model: "gpt-5.6-luna",
  reasoning: "low",
} satisfies CodexRuntimeOverride);

export const SUPPORT_SPECIALIST_RUNTIME = Object.freeze({
  model: "gpt-5.6-luna",
  reasoning: "low",
} satisfies CodexRuntimeOverride);

const SUPPORT_SPECIALIST_ARTIFACTS = new Set([
  "memo:market_news",
  "memo:benchmark",
  "memo:company_product",
  "memo:company_competition",
  "memo:valuation",
  "memo:financial_quality",
  "memo:risk_policy",
]);

export function researchRuntimeOverride(
  stage: CodexStage,
  logicalArtifactId: string,
  enabled = process.env["STOCKSEMBLY_LUNA_SUPPORT_SPECIALISTS"] === "1",
): typeof SUPPORT_SPECIALIST_RUNTIME | undefined {
  return enabled &&
    stage === "memo" &&
    SUPPORT_SPECIALIST_ARTIFACTS.has(logicalArtifactId)
    ? SUPPORT_SPECIALIST_RUNTIME
    : undefined;
}

export function trustedResearchRuntime(
  stage: AgentResearchStage,
  logicalArtifactId: string,
  lunaSupportSpecialistsEnabled = process.env[
    "STOCKSEMBLY_LUNA_SUPPORT_SPECIALISTS"
  ] === "1",
): Readonly<{
  model: AgentResearchModel;
  reasoning: AgentResearchReasoning;
}> {
  return (
    researchRuntimeOverride(
      stage,
      logicalArtifactId,
      lunaSupportSpecialistsEnabled,
    ) ?? {
      model: CODEX_RUNTIME_POLICY.model,
      reasoning: CODEX_RUNTIME_POLICY.reasoningByStage[stage],
    }
  );
}

export function isAllowedRuntimeOverride(
  stage: CodexStage,
  runtime: CodexRuntimeOverride,
): boolean {
  return (
    (stage === "qa" &&
      runtime.model === QA_ADVANCED_RUNTIME.model &&
      runtime.reasoning === QA_ADVANCED_RUNTIME.reasoning) ||
    (stage === "memo" &&
      runtime.model === SUPPORT_SPECIALIST_RUNTIME.model &&
      runtime.reasoning === SUPPORT_SPECIALIST_RUNTIME.reasoning)
  );
}

export const CODEX_RUNTIME_POLICY = Object.freeze({
  model: "gpt-5.6-luna",
  reasoningByStage: Object.freeze({
    memo: "low",
    department_consolidation: "low",
    blind_challenge: "low",
    owner_response_ballot: "low",
    follow_up: "low",
    semantic_audit: "low",
    chair_synthesis: "low",
    qa: "low",
    probe: "low",
  } satisfies Readonly<Record<CodexStage, CodexReasoning>>),
  browsingByStage: Object.freeze({
    memo: "audited_web",
    department_consolidation: "disabled",
    blind_challenge: "disabled",
    owner_response_ballot: "disabled",
    follow_up: "disabled",
    semantic_audit: "disabled",
    chair_synthesis: "disabled",
    qa: "audited_web",
    probe: "disabled",
  } satisfies Readonly<Record<CodexStage, CodexBrowsingPolicy>>),
  maxPromptBytes: 256 * 1_024,
  maxSchemaBytes: 128 * 1_024,
  maxStdoutBytes: 1_024 * 1_024,
  maxAuditedStdoutBytes: 24 * 1_024 * 1_024,
  maxStderrBytes: 64 * 1_024,
  maxPayloadBytes: 256 * 1_024,
  maxCapturedWebArtifactBytes: 2 * 1_024 * 1_024,
  maxCapturedWebAttemptBytes: 20 * 1_024 * 1_024,
  maxReportedWebRedirects: 5,
  maxReportedConcurrentWebOpens: 2,
  timeoutMs: undefined,
  inactivityTimeoutMs: 10 * 60_000,
  killGraceMs: 5_000,
});

export const CODEX_RUNTIME_PINS = Object.freeze({
  originPath: "/Applications/ChatGPT.app/Contents/Resources/codex",
  originSha256:
    "04ddea2f332bd524bf6cc02f8efcf45f0afa0c7d9b97d77aaef7bb84adf3d4c5",
  version: "codex-cli 0.147.0-alpha.6.5",
  sandboxExecPath: "/usr/bin/sandbox-exec",
  sandboxExecSha256:
    "f3162ae11789a5b296bb3850d493c33ddd52053a03f984b2c4bc34004f4fee99",
  certificatePath: "/etc/ssl/cert.pem",
  certificateSha256:
    "9dae8d76e55cb08991f2b672d58999ea15560d910759c16b544f843bdffbb994",
  codeIdentifier: "codex",
  teamIdentifier: "2DC432GLL2",
  codeDirectoryHash: "ab3668dac6034ce5b232f45a9a74b92978b49b74",
  locale: "en_US.UTF-8",
});

export const LINUX_CODEX_RUNTIME_PINS = Object.freeze({
  originPath:
    "/home/ec2-user/.codex/packages/standalone/releases/0.145.0-x86_64-unknown-linux-musl/bin/codex",
  originSha256:
    "a2a05dafaa1acb002a45eaec0a462de5b13694fcfcd7bc43305f14781ce7be14",
  version: "codex-cli 0.145.0",
  sandboxExecPath: "/usr/bin/false",
  sandboxExecSha256: "",
  certificatePath: "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem",
  certificateSha256:
    "9c927a9eefb9117fce0228bc5e4c859e9342ef9e6be8fd44246273c54ce69abb",
  codeIdentifier: "codex",
  teamIdentifier: "",
  codeDirectoryHash: "",
  locale: "en_US.UTF-8",
});

export const CODEX_DISABLED_FEATURES = [
  "apps",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "code_mode",
  "code_mode_host",
  "code_mode_only",
  "computer_use",
  "default_mode_request_user_input",
  "deferred_executor",
  "enable_fanout",
  "enable_mcp_apps",
  "goals",
  "hooks",
  "image_generation",
  "in_app_browser",
  "multi_agent",
  "multi_agent_v2",
  "network_proxy",
  "plugin_sharing",
  "plugins",
  "remote_plugin",
  "request_permissions_tool",
  "shell_snapshot",
  "shell_tool",
  "skill_mcp_dependency_install",
  "skill_search",
  "standalone_web_search",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "unified_exec",
  "unified_exec_zsh_fork",
  "workspace_dependencies",
] as const;

export function buildCodexArgv(
  schemaPath: string,
  stage: CodexStage,
  runtimeOverride?: CodexRuntimeOverride,
): readonly string[] {
  const browsing = CODEX_RUNTIME_POLICY.browsingByStage[stage];
  const model = runtimeOverride?.model ?? CODEX_RUNTIME_POLICY.model;
  const reasoning =
    runtimeOverride?.reasoning ?? CODEX_RUNTIME_POLICY.reasoningByStage[stage];
  return Object.freeze([
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
    model,
    "-c",
    `model_reasoning_effort="${reasoning}"`,
    "-c",
    'shell_environment_policy.inherit="none"',
    "-c",
    "shell_environment_policy.set={}",
    "-c",
    "mcp_servers={}",
    "-c",
    `web_search="${browsing === "audited_web" ? "live" : "disabled"}"`,
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    "-",
  ]);
}

export function buildChildEnvironment(
  runtimeHome: string,
  runtimeTemp: string,
  providerProxyUrl?: string,
  pins: {
    readonly certificatePath: string;
    readonly locale: string;
  } = CODEX_RUNTIME_PINS,
): Readonly<Record<string, string>> & { readonly PATH: string } {
  return Object.freeze({
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    CODEX_HOME: runtimeHome,
    HOME: join(dirname(runtimeHome), "home"),
    TMPDIR: runtimeTemp,
    LANG: pins.locale,
    LC_ALL: pins.locale,
    SSL_CERT_FILE: pins.certificatePath,
    NO_COLOR: "1",
    ...(providerProxyUrl === undefined
      ? {}
      : {
          HTTP_PROXY: providerProxyUrl,
          HTTPS_PROXY: providerProxyUrl,
          ALL_PROXY: providerProxyUrl,
          NO_PROXY: "",
        }),
  });
}

import { dirname, join } from "node:path";

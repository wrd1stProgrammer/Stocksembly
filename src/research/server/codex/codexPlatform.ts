import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ResearchExecutionBackend } from "../../domain/researchExecution";
import { CodexRunnerError } from "./codexErrors";
import { CODEX_RUNTIME_PINS, LINUX_CODEX_RUNTIME_PINS } from "./codexPolicy";
import { executeSpawn } from "./codexProcess";
import { type CodeSignature, inspectCodeSignature } from "./codexSignature";
import type { ProcessExecution, SpawnInvocation } from "./codexTypes";

export type CodexRuntimePins = {
  readonly originPath: string;
  readonly originSha256: string;
  readonly version: string;
  readonly sandboxExecPath: string;
  readonly sandboxExecSha256: string;
  readonly certificatePath: string;
  readonly certificateSha256: string;
  readonly codeIdentifier: string;
  readonly teamIdentifier: string;
  readonly codeDirectoryHash: string;
  readonly locale: string;
};

export type CodexRunnerPlatform = {
  readonly pins: CodexRuntimePins;
  readonly executionMode?: "sandbox_exec" | "direct";
  readonly authPath: string;
  readonly authentication?: ResearchExecutionBackend;
  readonly tempParent: string;
  readonly hostEnvironment: NodeJS.ProcessEnv;
  readonly inspectSignature?: (
    path: string,
    environment: SpawnInvocation["environment"],
  ) => Promise<CodeSignature>;
  readonly runVersion: (
    invocation: SpawnInvocation,
  ) => Promise<ProcessExecution>;
  readonly runCodex: (invocation: SpawnInvocation) => Promise<ProcessExecution>;
  readonly beforeLink?: () => Promise<void>;
  readonly linkFile?: (existingPath: string, newPath: string) => Promise<void>;
};

const FORBIDDEN_OVERRIDES = [
  "STOCKSEMBLY_CODEX_BINARY",
  "CODEX_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
] as const;

export function assertHostPolicy(
  environment: NodeJS.ProcessEnv,
  locale: string,
): void {
  if (FORBIDDEN_OVERRIDES.some((name) => Object.hasOwn(environment, name)))
    throw new CodexRunnerError("policy_violation");
  const { LANG: language, LC_ALL: localeAll } = environment;
  if (
    (language !== undefined && language !== locale) ||
    (localeAll !== undefined && localeAll !== locale)
  )
    throw new CodexRunnerError("policy_violation");
}

export function productionCodexPlatform(
  authentication: ResearchExecutionBackend = "subscription",
): CodexRunnerPlatform {
  if (process.platform !== "darwin" && process.platform !== "linux")
    throw new CodexRunnerError("policy_violation");
  const direct = process.platform === "linux";
  const pins = direct ? LINUX_CODEX_RUNTIME_PINS : CODEX_RUNTIME_PINS;
  const linuxOriginDirectory = dirname(LINUX_CODEX_RUNTIME_PINS.originPath);
  const subscriptionAuthPath = join(homedir(), ".codex", "auth.json");
  const apiAuthPath = process.env["STOCKSEMBLY_CODEX_API_AUTH_PATH"]?.trim();
  if (
    authentication === "api" &&
    (process.env["STOCKSEMBLY_CODEX_API_ENABLED"] !== "1" ||
      apiAuthPath === undefined ||
      !isAbsolute(apiAuthPath) ||
      resolve(apiAuthPath) === subscriptionAuthPath)
  )
    throw new CodexRunnerError("auth_unavailable");
  return Object.freeze({
    pins,
    authentication,
    executionMode: direct ? "direct" : "sandbox_exec",
    authPath:
      authentication === "api" ? (apiAuthPath ?? "") : subscriptionAuthPath,
    tempParent: direct ? linuxOriginDirectory : tmpdir(),
    hostEnvironment: {
      ...process.env,
      LANG: pins.locale,
      LC_ALL: pins.locale,
    },
    ...(direct ? {} : { inspectSignature: inspectCodeSignature }),
    runVersion: executeSpawn,
    runCodex: executeSpawn,
  });
}

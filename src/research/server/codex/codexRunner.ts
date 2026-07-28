export {
  buildChildEnvironment,
  buildCodexArgv,
  CODEX_DISABLED_FEATURES,
  CODEX_RUNTIME_PINS,
  CODEX_RUNTIME_POLICY,
  CODEX_STAGES,
  type CodexStage,
} from "./codexPolicy";

function portWithPlatform(
  platform: CodexRunnerPlatform,
  reservations: LaunchReservationReader,
): CodexPort {
  const run = async <Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> =>
    await runCodexWithPlatform(input, platform, reservations);
  return Object.freeze({
    id: "isolated-codex-cli",
    kind: "real",
    run,
  });
}

export function createCodexPort(
  reservations: LaunchReservationReader,
): CodexPort {
  return createReadinessGuardedCodexPort(
    portWithPlatform(productionCodexPlatform(), reservations),
    runProductionCodexReadinessProbe,
  );
}

export function createCodexPortForTesting(
  platform: CodexRunnerPlatform,
  reservations: LaunchReservationReader,
): CodexPort {
  return portWithPlatform(platform, reservations);
}

export { CODEX_FAILURE_CLASSES, CodexRunnerError } from "./codexErrors";
export type {
  CommittedLaunchReservation,
  LaunchFence,
  LaunchReservationClaim,
  LaunchReservationKey,
  LaunchReservationReader,
} from "./codexReservation";
export { codexInputHash } from "./codexReservation";
export type {
  CodexPort,
  CodexRunInput,
  CodexRunResult,
  SafeCodexEvidence,
} from "./codexTypes";

import type { CodexRunnerPlatform } from "./codexPlatform";
import { productionCodexPlatform } from "./codexPlatform";
import type { LaunchReservationReader } from "./codexReservation";
import { runCodexWithPlatform } from "./codexRunnerCore";
import type { CodexPort, CodexRunInput, CodexRunResult } from "./codexTypes";
import { createReadinessGuardedCodexPort } from "./readiness";
import { runProductionCodexReadinessProbe } from "./readinessProbe";

import { assertNever } from "./ids";

export { BYTES, LIMITS } from "./limits.constants";

import { BYTES, LIMITS } from "./limits.constants";

export type StageKind =
  | "specialist"
  | "department"
  | "challenge"
  | "response"
  | "follow_up"
  | "semantic_audit"
  | "chair"
  | "question";

export type LimitName =
  | "command_body_bytes"
  | "question_chars"
  | "physical_launches"
  | "mandatory_calls"
  | "disk_free_bytes"
  | "source_response_bytes"
  | "normalized_filing_bytes"
  | "role_evidence_pack_bytes"
  | "final_payload_bytes"
  | "stdout_jsonl_bytes"
  | "stderr_quarantine_bytes"
  | "artifacts_per_run_bytes"
  | "replacement_per_artifact";

type MeasurementField =
  | LimitName
  | "active_runs"
  | "queued_runs"
  | "follow_ups"
  | "replacements";

export type LimitOutcome =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "limit_exceeded";
      readonly limit: LimitName;
      readonly actual: number;
      readonly maximum: number;
    }
  | {
      readonly kind: "queue_full";
      readonly active: number;
      readonly queued: number;
    }
  | {
      readonly kind: "disk_low";
      readonly availableBytes: number;
      readonly requiredBytes: number;
    }
  | {
      readonly kind: "invalid_measurement";
      readonly field: MeasurementField;
      readonly actual: number;
    };

const validMeasurement = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value >= 0;
const invalidMeasurement = (
  field: MeasurementField,
  actual: number,
): LimitOutcome => ({ kind: "invalid_measurement", field, actual });

function exceeded(
  limit: LimitName,
  actual: number,
  maximum: number,
): LimitOutcome {
  return { kind: "limit_exceeded", limit, actual, maximum };
}
const bounded = (
  limit: LimitName,
  actual: number,
  maximum: number,
): LimitOutcome =>
  actual <= maximum ? { kind: "accepted" } : exceeded(limit, actual, maximum);

function sizeOf(value: number | string | Uint8Array): number {
  if (typeof value === "number") return value;
  if (typeof value === "string")
    return new TextEncoder().encode(value).byteLength;
  return value.byteLength;
}

export function checkCommandBodySize(
  value: number | string | Uint8Array,
): LimitOutcome {
  const actual = sizeOf(value);
  if (typeof value === "number" && !validMeasurement(actual))
    return invalidMeasurement("command_body_bytes", actual);
  return bounded("command_body_bytes", actual, LIMITS.command.maxBodyBytes);
}

export function checkQuestionLength(value: string): LimitOutcome {
  const actual = Array.from(value).length;
  return bounded("question_chars", actual, LIMITS.question.maxChars);
}

export function checkRunAdmission(
  active: number,
  queued: number,
): LimitOutcome {
  if (!validMeasurement(active))
    return invalidMeasurement("active_runs", active);
  if (!validMeasurement(queued))
    return invalidMeasurement("queued_runs", queued);
  if (
    active > LIMITS.admission.activeRuns ||
    queued >= LIMITS.admission.queuedRuns
  ) {
    return { kind: "queue_full", active, queued };
  }
  return { kind: "accepted" };
}

export function checkDiskAdmission(availableBytes: number): LimitOutcome {
  if (!validMeasurement(availableBytes))
    return invalidMeasurement("disk_free_bytes", availableBytes);
  return availableBytes >= LIMITS.disk.minFreeBytes
    ? { kind: "accepted" }
    : {
        kind: "disk_low",
        availableBytes,
        requiredBytes: LIMITS.disk.minFreeBytes,
      };
}

export function checkLaunchBudget(
  mandatoryCalls: number,
  followUps: number,
  replacements: number,
): LimitOutcome {
  if (!validMeasurement(mandatoryCalls))
    return invalidMeasurement("mandatory_calls", mandatoryCalls);
  if (!validMeasurement(followUps))
    return invalidMeasurement("follow_ups", followUps);
  if (!validMeasurement(replacements))
    return invalidMeasurement("replacements", replacements);
  if (mandatoryCalls !== LIMITS.research.mandatoryCalls) {
    return exceeded(
      "mandatory_calls",
      mandatoryCalls,
      LIMITS.research.mandatoryCalls,
    );
  }
  const total = mandatoryCalls + followUps + replacements;
  if (
    followUps > LIMITS.research.maxFollowUps ||
    replacements > LIMITS.research.maxReplacements
  ) {
    return exceeded(
      "physical_launches",
      total,
      LIMITS.research.maxPhysicalLaunches,
    );
  }
  return bounded(
    "physical_launches",
    total,
    LIMITS.research.maxPhysicalLaunches,
  );
}

export function allowedFollowUps(replacementsUsed: number): number {
  if (!validMeasurement(replacementsUsed)) return 0;
  if (replacementsUsed > LIMITS.research.maxReplacements) return 0;
  return Math.min(
    LIMITS.research.maxFollowUps,
    LIMITS.research.maxPhysicalLaunches -
      LIMITS.research.mandatoryCalls -
      replacementsUsed,
  );
}

export function checkArtifactReplacement(
  existingReplacementCount: number,
): LimitOutcome {
  if (!validMeasurement(existingReplacementCount))
    return invalidMeasurement(
      "replacement_per_artifact",
      existingReplacementCount,
    );
  return bounded(
    "replacement_per_artifact",
    existingReplacementCount + 1,
    LIMITS.research.maxReplacementsPerArtifact,
  );
}

export function checkByteLimit(limit: LimitName, value: number): LimitOutcome {
  const maximums: Readonly<Record<LimitName, number>> = {
    command_body_bytes: LIMITS.command.maxBodyBytes,
    question_chars: LIMITS.question.maxChars,
    physical_launches: LIMITS.research.maxPhysicalLaunches,
    mandatory_calls: LIMITS.research.mandatoryCalls,
    disk_free_bytes: LIMITS.disk.minFreeBytes,
    source_response_bytes: BYTES.maxRawSourceResponse,
    normalized_filing_bytes: BYTES.maxNormalizedFiling,
    role_evidence_pack_bytes: BYTES.maxRoleEvidencePack,
    final_payload_bytes: BYTES.maxFinalPayload,
    stdout_jsonl_bytes: BYTES.maxStdoutJsonl,
    stderr_quarantine_bytes: BYTES.maxStderrQuarantine,
    artifacts_per_run_bytes: BYTES.maxArtifactsPerRun,
    replacement_per_artifact: LIMITS.research.maxReplacementsPerArtifact,
  };
  const maximum = maximums[limit];
  if (!validMeasurement(value)) return invalidMeasurement(limit, value);
  if (limit === "disk_free_bytes") return checkDiskAdmission(value);
  return bounded(limit, value, maximum);
}

export function stageTimeoutSeconds(stage: StageKind): number {
  switch (stage) {
    case "specialist":
    case "semantic_audit":
      return 360;
    case "department":
    case "challenge":
    case "response":
    case "follow_up":
      return 300;
    case "chair":
      return 480;
    case "question":
      return 90;
    default:
      return assertNever(stage);
  }
}

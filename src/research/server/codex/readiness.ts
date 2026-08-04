import { createHash } from "node:crypto";
import type { CodexPort, CodexRunInput, SafeCodexEvidence } from "./codexTypes";
import type { SentinelAccess } from "./readinessSentinels";

export const READINESS_SCOPES = ["worker_admission", "pre_launch"] as const;
export type ReadinessScope = (typeof READINESS_SCOPES)[number];

export const READINESS_CHECKS = [
  "profile",
  "binary",
  "inode",
  "certificate",
  "locale",
  "environment",
  "version",
  "feature",
  "login",
  "schema",
  "tool",
  "sentinel",
  "temporary_storage",
  "probe",
] as const;
export type ReadinessCheck = (typeof READINESS_CHECKS)[number];

export const READINESS_REASONS = [
  "report_validation",
  "platform_policy",
  "workspace_prepare",
  "binary_verify",
  "certificate_probe",
  "binary_stat",
  "sandbox_probe",
  "feature_probe",
  "login_probe",
  "runner_process",
  "runner_contract",
  "environment_keys",
  "environment_values",
  "input_validation",
  "reservation_validation",
  "host_policy",
  "origin_protection",
  "runtime_prepare",
  "sandbox_profile",
  "manifest_write",
  "signature_probe",
  "version_probe",
  "model_probe",
  "artifact_audit",
  "cleanup",
] as const;
export type ReadinessReason = (typeof READINESS_REASONS)[number];
export type SafeReadinessDiagnostics = {
  readonly check: ReadinessCheck;
  readonly reason: ReadinessReason;
};

export type ReadinessObservation = {
  readonly evidence: SafeCodexEvidence;
  readonly expectedBinaryHash: string;
  readonly expectedVersion: string;
  readonly sandboxHash: string;
  readonly certificateHash: string;
  readonly localeHash: string;
  readonly disabledFeaturesHash: string;
  readonly expectedDisabledFeaturesHash: string;
  readonly allowedEvidenceHash: string;
  readonly returnedEvidenceHash: string;
  readonly artifactExposure: "clear" | "detected";
  readonly temporaryStorage: "writable_same_device" | "unusable";
  readonly sandbox: "verified" | "unavailable";
  readonly certificate: "verified" | "untrusted";
  readonly locale: "verified" | "unavailable";
  readonly environment: "exact" | "inherited";
  readonly disabledFeatures: "verified" | "enabled";
  readonly login: "available" | "unavailable";
  readonly sentinelAccess: SentinelAccess;
};

export type SafeCodexReadinessReport = {
  readonly schema: "stocksembly.codex-readiness.v1";
  readonly scope: ReadinessScope;
  readonly status: "ready";
  readonly binaryVersion: string;
  readonly binaryHash: string;
  readonly sandboxHash: string;
  readonly certificateHash: string;
  readonly localeHash: string;
  readonly originIdentityHash: string;
  readonly linkIdentityHash: string;
  readonly profileHash: string;
  readonly environmentHash: string;
  readonly argvHash: string;
  readonly schemaHash: string;
  readonly disabledFeaturesHash: string;
  readonly eventTypesHash: string;
  readonly sentinelIsolation: "passed";
  readonly noToolProbe: "passed";
  readonly login: "passed";
  readonly temporaryStorage: "passed";
  readonly cleanup: "complete";
};

export class CodexIsolationError extends Error {
  readonly name = "CodexIsolationError";
  readonly code = "CODEX_ISOLATION_FAILED";

  constructor(
    readonly check: ReadinessCheck,
    readonly reason: ReadinessReason = "report_validation",
  ) {
    super("Codex isolation readiness failed");
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fail(check: ReadinessCheck): never {
  throw new CodexIsolationError(check);
}

const SAFE_BINARY_VERSION = /^codex-cli [0-9A-Za-z.-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function buildSafeReadinessReport(
  scope: ReadinessScope,
  observation: ReadinessObservation,
): SafeCodexReadinessReport {
  const { evidence } = observation;
  if (
    !SHA256.test(observation.expectedBinaryHash) ||
    evidence.binaryHash !== observation.expectedBinaryHash
  )
    fail("binary");
  if (
    !SAFE_BINARY_VERSION.test(observation.expectedVersion) ||
    evidence.binaryVersion !== observation.expectedVersion
  )
    fail("version");
  if (
    evidence.originDevice !== evidence.linkDevice ||
    evidence.originInode !== evidence.linkInode
  )
    fail("inode");
  if (observation.sandbox !== "verified") fail("profile");
  if (observation.certificate !== "verified") fail("certificate");
  if (observation.locale !== "verified") fail("locale");
  if (observation.environment !== "exact") fail("environment");
  if (observation.disabledFeatures !== "verified") fail("feature");
  if (
    observation.disabledFeaturesHash !==
    observation.expectedDisabledFeaturesHash
  )
    fail("feature");
  if (observation.login === "unavailable") fail("login");
  if (evidence.toolEventCount !== 0) fail("tool");
  if (observation.returnedEvidenceHash !== observation.allowedEvidenceHash)
    fail("schema");
  if (observation.artifactExposure !== "clear") fail("sentinel");
  if (
    observation.sentinelAccess.allowedEvidence !== "readable" ||
    observation.sentinelAccess.project !== "blocked" ||
    observation.sentinelAccess.originalHome !== "blocked" ||
    observation.sentinelAccess.inheritedEnvironment !== "blocked"
  )
    fail("sentinel");
  if (observation.temporaryStorage !== "writable_same_device")
    fail("temporary_storage");
  return Object.freeze({
    schema: "stocksembly.codex-readiness.v1",
    scope,
    status: "ready",
    binaryVersion: evidence.binaryVersion,
    binaryHash: evidence.binaryHash,
    sandboxHash: observation.sandboxHash,
    certificateHash: observation.certificateHash,
    localeHash: observation.localeHash,
    originIdentityHash: hash([evidence.originDevice, evidence.originInode]),
    linkIdentityHash: hash([evidence.linkDevice, evidence.linkInode]),
    profileHash: evidence.profileHash,
    environmentHash: evidence.environmentHash,
    argvHash: evidence.argvHash,
    schemaHash: evidence.schemaHash,
    disabledFeaturesHash: observation.disabledFeaturesHash,
    eventTypesHash: hash(evidence.eventTypes),
    sentinelIsolation: "passed",
    noToolProbe: "passed",
    login: "passed",
    temporaryStorage: "passed",
    cleanup: "complete",
  });
}

export type CodexReadinessProbe = (
  scope: ReadinessScope,
) => Promise<SafeCodexReadinessReport>;

type ReadinessGuardOptions = {
  readonly fingerprint?: () => string;
  readonly successTtlMs?: number;
  readonly now?: () => number;
};

const processReadiness = new Map<
  string,
  { readonly promise: Promise<void>; expiresAt: number }
>();
let readinessGuardOrdinal = 0;

export function createReadinessGuardedCodexPort(
  inner: CodexPort,
  probe: CodexReadinessProbe,
  options: ReadinessGuardOptions = {},
): CodexPort {
  const now = options.now ?? Date.now;
  const successTtlMs = options.successTtlMs ?? 30_000;
  const fallbackFingerprint = `instance:${++readinessGuardOrdinal}`;
  const ensureReady = (): Promise<void> => {
    const fingerprint = options.fingerprint?.() ?? fallbackFingerprint;
    const existing = processReadiness.get(fingerprint);
    if (existing !== undefined && existing.expiresAt > now())
      return existing.promise;
    const readiness = probe("pre_launch")
      .then(() => undefined)
      .catch((error: unknown) => {
        if (processReadiness.get(fingerprint)?.promise === readiness)
          processReadiness.delete(fingerprint);
        throw error;
      });
    processReadiness.set(fingerprint, {
      promise: readiness,
      expiresAt: now() + successTtlMs,
    });
    return readiness;
  };
  return Object.freeze({
    id: "isolated-codex-cli",
    kind: "real",
    async run<Candidate>(input: CodexRunInput<Candidate>) {
      await ensureReady();
      return await inner.run<Candidate>(input);
    },
  });
}

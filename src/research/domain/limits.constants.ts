const KIB = 1024;
const MIB = KIB * KIB;
const GIB = KIB * KIB * KIB;

function configuredLimit(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

const ACTIVE_RUNS = configuredLimit("STOCKSEMBLY_ACTIVE_RUNS", 2);
const GLOBAL_CODEX_PROCESSES = configuredLimit(
  "STOCKSEMBLY_GLOBAL_CODEX_PROCESSES",
  11,
);

export const BYTES = {
  commandBody: 64 * KIB,
  maxRawSourceResponse: 25 * MIB,
  maxNormalizedFiling: 2 * MIB,
  maxRoleEvidencePack: 256 * KIB,
  maxFinalPayload: 1 * MIB,
  maxStdoutJsonl: 8 * MIB,
  maxStderrQuarantine: 1 * MIB,
  maxArtifactsPerRun: 256 * MIB,
} as const;

export const LIMITS = {
  admission: {
    activeRuns: ACTIVE_RUNS,
    queuedRuns: 8,
    globalCodexProcesses: GLOBAL_CODEX_PROCESSES,
  },
  source: {
    maxRawResponseBytes: BYTES.maxRawSourceResponse,
    maxNormalizedFilingBytes: BYTES.maxNormalizedFiling,
    maxRoleEvidencePackBytes: BYTES.maxRoleEvidencePack,
    maxFinalPayloadBytes: BYTES.maxFinalPayload,
  },
  streams: {
    maxStdoutJsonlBytes: BYTES.maxStdoutJsonl,
    maxStderrQuarantineBytes: BYTES.maxStderrQuarantine,
    maxArtifactsPerRunBytes: BYTES.maxArtifactsPerRun,
  },
  disk: { minFreeBytes: 2 * GIB },
  question: { maxChars: 4_000, maxAttemptsPerReport: 20, maxActive: 1 },
  command: { maxBodyBytes: BYTES.commandBody },
  remote: {
    timeoutSeconds: 60,
    transientAttempts: 3,
    secRequestsPerSecond: 8,
    blsDailyRequests: 25,
  },
  runtime: {
    leaseSeconds: 30,
    heartbeatSeconds: 10,
    sqliteBusyTimeoutSeconds: 5,
    ssePollSeconds: 1,
    sseHeartbeatSeconds: 15,
  },
  process: { termGraceSeconds: 5, totalResearchWallClockSeconds: 3_600 },
  research: {
    mandatoryCalls: 26,
    maxFollowUps: 3,
    maxReplacements: 5,
    maxReplacementsPerArtifact: 1,
    maxPhysicalLaunches: 34,
  },
  rights: { maxDisplayedExcerptChars: 500 },
} as const;

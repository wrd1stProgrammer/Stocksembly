import {
  type CompositionValueKind,
  isTrustedCompositionOrigin,
  isTrustedCompositionValue,
} from "./compositionMode.membership";
import type { ResearchEvent } from "./types";

export const RESEARCH_MODES = {
  fixture: "fixture",
  official: "official",
  calibration: "calibration",
} as const;

export type ResearchMode = (typeof RESEARCH_MODES)[keyof typeof RESEARCH_MODES];

export const COMPOSITION_ERROR_CODES = {
  mixedResearchMode: "MIXED_RESEARCH_MODE",
  liveAdaptersRequired: "LIVE_ADAPTERS_REQUIRED",
  realCodexRequired: "REAL_CODEX_REQUIRED",
  unsupportedMode: "UNSUPPORTED_RESEARCH_MODE",
} as const;

export type CompositionErrorCode =
  (typeof COMPOSITION_ERROR_CODES)[keyof typeof COMPOSITION_ERROR_CODES];

export class ResearchCompositionError extends Error {
  readonly name = "ResearchCompositionError";

  constructor(
    readonly code: CompositionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type CompositionOrigin<M extends ResearchMode = ResearchMode> = {
  readonly kind: "research-composition-origin";
  readonly mode: M;
  readonly id: `stocksembly:${M}`;
};

export type ModeTagged<T> = T & {
  readonly mode: ResearchMode;
  readonly origin: CompositionOrigin;
};
export type ModeTaggedFor<T, M extends ResearchMode> = Omit<
  T,
  "mode" | "origin"
> & {
  readonly mode: M;
  readonly origin: CompositionOrigin<M>;
};
export type ModeTaggedFixture<T> = ModeTaggedFor<T, "fixture">;
export type ModeTaggedOfficial<T> = ModeTaggedFor<T, "official">;
export type ModeTaggedCalibration<T> = ModeTaggedFor<T, "calibration">;

export type ResearchArtifact = ModeTagged<{
  readonly id: string;
  readonly kind: string;
  readonly snapshotId: string;
  readonly contentHash: string;
}>;

export type ResearchArtifactFor<M extends ResearchMode> = ModeTaggedFor<
  ResearchArtifact,
  M
>;

export type ResearchEventWithMode = ModeTagged<ResearchEvent>;
export type ResearchEventWithModeFor<M extends ResearchMode> = ModeTaggedFor<
  ResearchEvent,
  M
>;

export type ResearchSnapshot = {
  readonly id: string;
  readonly mode: ResearchMode;
  readonly origin: CompositionOrigin;
  readonly artifactIds: readonly string[];
};

export type ResearchSnapshotFor<M extends ResearchMode> = ModeTaggedFor<
  ResearchSnapshot,
  M
>;

function originMatches<M extends ResearchMode>(
  expected: M,
  value: unknown,
): value is CompositionOrigin<M> {
  return isTrustedCompositionOrigin(value, expected);
}

export function assertMode(
  expected: ResearchMode,
  actual: ResearchMode,
  context: string,
): void {
  if (expected === actual) return;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} belongs to ${actual} mode; ${expected} mode is required`,
  );
}

export function assertSnapshotMode<M extends ResearchMode>(
  expected: M,
  snapshot: ResearchSnapshot,
): ResearchSnapshotFor<M> {
  assertTrustedValue(expected, snapshot, "snapshot", `snapshot ${snapshot.id}`);
  assertMode(expected, snapshot.mode, `snapshot ${snapshot.id}`);
  assertOrigin(expected, snapshot.origin, `snapshot ${snapshot.id}`);
  return snapshot as ResearchSnapshotFor<M>;
}

export function assertArtifactMode<M extends ResearchMode>(
  expected: M,
  artifact: ResearchArtifact,
): ResearchArtifactFor<M> {
  assertTrustedValue(expected, artifact, "artifact", `artifact ${artifact.id}`);
  assertMode(expected, artifact.mode, `artifact ${artifact.id}`);
  assertOrigin(expected, artifact.origin, `artifact ${artifact.id}`);
  return artifact as ResearchArtifactFor<M>;
}

export function assertEventMode<M extends ResearchMode>(
  expected: M,
  event: ResearchEventWithMode,
): ResearchEventWithModeFor<M> {
  assertTrustedValue(expected, event, "event", `event ${event.id}`);
  assertMode(expected, event.mode, `event ${event.id}`);
  assertOrigin(expected, event.origin, `event ${event.id}`);
  return event as ResearchEventWithModeFor<M>;
}

export function assertPayloadMode(
  expected: Exclude<ResearchMode, "calibration">,
  payload: object,
  origin: unknown,
): void {
  assertTrustedValue(
    expected,
    payload,
    "payload",
    `${expected} payload`,
    origin,
  );
}

function assertTrustedValue(
  expected: ResearchMode,
  value: object,
  kind: CompositionValueKind,
  context: string,
  origin: unknown = originOf(value),
): void {
  if (isTrustedCompositionValue(value, kind, expected, origin)) return;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} has an unverified composition attestation`,
  );
}

function originOf(value: object): unknown {
  if ("origin" in value) return value.origin;
  return undefined;
}

function assertOrigin(
  expected: ResearchMode,
  actual: unknown,
  context: string,
): void {
  if (originMatches(expected, actual)) return;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} has an unverified composition origin`,
  );
}

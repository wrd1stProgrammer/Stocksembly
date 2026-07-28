import {
  assertArtifactMode,
  assertEventMode,
  assertSnapshotMode,
  COMPOSITION_ERROR_CODES,
  type CompositionOrigin,
  type ResearchArtifact,
  type ResearchArtifactFor,
  ResearchCompositionError,
  type ResearchEventWithModeFor,
  type ResearchMode,
  type ResearchSnapshotFor,
} from "../compositionMode";
import {
  isTrustedCompositionOrigin,
  registerTrustedCompositionOrigin,
  registerTrustedCompositionValue,
} from "../compositionMode.authority.internal";
import type { ResearchEvent } from "../types";
import { validateCompositionPayload } from "./payloadValidation";
import type {
  CodexInvocationReceiptFor,
  CompositionViewDataFor,
  ResearchCompositionPayloadFor,
} from "./types";

export function createCompositionOrigin<M extends ResearchMode>(
  mode: M,
): CompositionOrigin<M> {
  const origin: CompositionOrigin<M> = {
    kind: "research-composition-origin",
    mode,
    id: `stocksembly:${mode}`,
  };
  const frozenOrigin = Object.freeze(origin);
  if (!registerTrustedCompositionOrigin(frozenOrigin, mode)) {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `cannot register ${mode} composition origin`,
    );
  }
  return frozenOrigin;
}

export function stampEvent<M extends ResearchMode>(
  event: ResearchEvent,
  origin: CompositionOrigin<M>,
): ResearchEventWithModeFor<M> {
  assertOriginForConstruction(origin, event.id);
  if (hasModeBoundary(event)) {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `event ${event.id} cannot be relabeled after composition attestation`,
    );
  }
  const stamped = Object.freeze({ ...event, mode: origin.mode, origin });
  attest(stamped, "event", origin.mode, origin, `event ${event.id}`);
  return stamped;
}

export function stampArtifact<
  M extends ResearchMode,
  T extends Omit<ResearchArtifact, "mode" | "origin">,
>(artifact: T, origin: CompositionOrigin<M>): ResearchArtifactFor<M> {
  assertOriginForConstruction(origin, artifact.id);
  if (hasModeBoundary(artifact)) {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `artifact ${artifact.id} cannot be relabeled after composition attestation`,
    );
  }
  const stamped = Object.freeze({ ...artifact, mode: origin.mode, origin });
  attest(stamped, "artifact", origin.mode, origin, `artifact ${artifact.id}`);
  return stamped;
}

export function createSnapshot<M extends ResearchMode>(
  id: string,
  origin: CompositionOrigin<M>,
  artifactIds: readonly string[],
): ResearchSnapshotFor<M> {
  assertOriginForConstruction(origin, id);
  const snapshot = Object.freeze({
    id,
    mode: origin.mode,
    origin,
    artifactIds: Object.freeze([...artifactIds]),
  });
  attest(snapshot, "snapshot", origin.mode, origin, `snapshot ${id}`);
  return snapshot;
}

export function createCompositionPayload<M extends "fixture" | "official">(
  origin: CompositionOrigin<M>,
  data: CompositionViewDataFor<M>,
  snapshot: ResearchSnapshotFor<M>,
  codex: CodexInvocationReceiptFor<M>,
): ResearchCompositionPayloadFor<M> {
  assertOriginForConstruction(origin, snapshot.id);
  assertSnapshotMode(origin.mode, snapshot);
  const ownedData = ownCompositionData(data, origin);
  const ownedSnapshot = createSnapshot(
    snapshot.id,
    origin,
    snapshot.artifactIds,
  );
  const ownedCodex = cloneAndFreeze(codex);
  const payload = Object.freeze({
    mode: origin.mode,
    origin,
    data: ownedData,
    snapshot: ownedSnapshot,
    codex: ownedCodex,
  });
  attest(payload, "payload", origin.mode, origin, `${origin.mode} payload`);
  validateCompositionPayload(payload);
  return payload;
}

function assertOriginForConstruction(
  origin: CompositionOrigin,
  context: string,
): void {
  if (isTrustedCompositionOrigin(origin, origin.mode)) return;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} has an unverified composition origin`,
  );
}

function attest(
  value: object,
  kind: "event" | "artifact" | "snapshot" | "payload",
  mode: ResearchMode,
  origin: CompositionOrigin,
  context: string,
): void {
  if (registerTrustedCompositionValue(value, kind, mode, origin)) return;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} has an unverified composition attestation`,
  );
}

function hasModeBoundary(value: object): boolean {
  return "mode" in value || "origin" in value;
}

function ownCompositionData<M extends "fixture" | "official">(
  data: CompositionViewDataFor<M>,
  origin: CompositionOrigin<M>,
): CompositionViewDataFor<M> {
  if (
    !Array.isArray(data.events) ||
    !Array.isArray(data.playbackEvents) ||
    !Array.isArray(data.artifacts)
  ) {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `${origin.mode} payload has no mode-bound event/artifact arrays`,
    );
  }
  return Object.freeze({
    agents: cloneAndFreeze(data.agents),
    events: ownEvents(data.events, origin),
    playbackEvents: ownEvents(data.playbackEvents, origin),
    phaseLabels: cloneAndFreeze(data.phaseLabels),
    report: cloneAndFreeze(data.report),
    artifacts: ownArtifacts(data.artifacts, origin),
    history: cloneAndFreeze(data.history),
    defaultAgentIds: cloneAndFreeze(data.defaultAgentIds),
    sources: cloneAndFreeze(data.sources),
  }) as CompositionViewDataFor<M>;
}

function ownEvents<M extends "fixture" | "official">(
  events: readonly ResearchEventWithModeFor<M>[],
  origin: CompositionOrigin<M>,
): readonly ResearchEventWithModeFor<M>[] {
  return Object.freeze(
    events.map((event) => {
      if (hasModeBoundary(event)) assertEventMode(origin.mode, event);
      return stampEvent(
        cloneAndFreeze(withoutModeBoundary(event)) as ResearchEvent,
        origin,
      );
    }),
  );
}

function ownArtifacts<M extends "fixture" | "official">(
  artifacts: readonly ResearchArtifactFor<M>[],
  origin: CompositionOrigin<M>,
): readonly ResearchArtifactFor<M>[] {
  return Object.freeze(
    artifacts.map((artifact) => {
      if (hasModeBoundary(artifact)) assertArtifactMode(origin.mode, artifact);
      return stampArtifact(
        cloneAndFreeze(withoutModeBoundary(artifact)) as Omit<
          ResearchArtifact,
          "mode" | "origin"
        >,
        origin,
      );
    }),
  );
}

function withoutModeBoundary(value: object): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "mode" || key === "origin") continue;
    copy[key] = nested;
  }
  return copy;
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreeze(entry))) as T;
  }
  if (isObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      copy[key] = cloneAndFreeze(nested);
    }
    return Object.freeze(copy) as T;
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

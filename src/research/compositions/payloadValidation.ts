import type {
  ResearchArtifact,
  ResearchEventWithMode,
  ResearchSnapshot,
} from "../compositionMode";
import {
  assertArtifactMode,
  assertEventMode,
  assertPayloadMode,
  assertSnapshotMode,
  COMPOSITION_ERROR_CODES,
  ResearchCompositionError,
} from "../compositionMode";
import type { ResearchCompositionPayload } from "./types";

export function validateCompositionPayload(
  payload: unknown,
): ResearchCompositionPayload {
  if (!isRecord(payload)) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      "composition payload must be an object",
    );
  }
  const mode = property(payload, "mode");
  if (mode !== "fixture" && mode !== "official") {
    fail(
      COMPOSITION_ERROR_CODES.unsupportedMode,
      `unsupported composition payload mode: ${String(mode)}`,
    );
  }
  const data = property(payload, "data");
  const origin = property(payload, "origin");
  const snapshot = property(payload, "snapshot");
  const codex = property(payload, "codex");
  if (
    !isRecord(data) ||
    !isRecord(origin) ||
    !isRecord(snapshot) ||
    !isRecord(codex)
  ) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      "composition payload is missing mode-bound data",
    );
  }
  assertPayloadMode(mode, payload, origin);
  const expectedOriginId = `stocksembly:${mode}`;
  if (property(snapshot, "mode") !== mode) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `snapshot belongs to ${String(property(snapshot, "mode"))} mode; ${mode} mode is required`,
    );
  }
  if (
    (mode === "fixture" && property(codex, "kind") !== "fake") ||
    (mode === "official" && property(codex, "kind") !== "real")
  ) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `Codex provenance does not match ${mode} mode`,
    );
  }
  const invocationCount = property(codex, "invocationCount");
  if (typeof invocationCount !== "number" || invocationCount < 1) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      `${mode} payload has no verified Codex invocation`,
    );
  }
  const events = property(data, "events");
  const playbackEvents = property(data, "playbackEvents");
  const artifacts = property(data, "artifacts");
  if (
    !Array.isArray(events) ||
    !Array.isArray(playbackEvents) ||
    !Array.isArray(artifacts)
  ) {
    fail(
      COMPOSITION_ERROR_CODES.mixedResearchMode,
      "composition payload has no mode-bound event/artifact arrays",
    );
  }
  for (const event of [...events, ...playbackEvents]) {
    if (!isRecord(event) || property(event, "mode") !== mode) {
      fail(
        COMPOSITION_ERROR_CODES.mixedResearchMode,
        `${mode} payload contains an event from another mode`,
      );
    }
    assertOriginId(event, expectedOriginId, `${mode} payload event`);
    assertEventMode(mode, event as ResearchEventWithMode);
  }
  for (const artifact of artifacts) {
    if (!isRecord(artifact) || property(artifact, "mode") !== mode) {
      fail(
        COMPOSITION_ERROR_CODES.mixedResearchMode,
        `${mode} payload contains an artifact from another mode`,
      );
    }
    assertOriginId(artifact, expectedOriginId, `${mode} payload artifact`);
    assertArtifactMode(mode, artifact as ResearchArtifact);
  }
  assertSnapshotMode(mode, snapshot as ResearchSnapshot);
  return payload as ResearchCompositionPayload;
}

function assertOriginId(
  record: Record<string, unknown>,
  expected: string,
  context: string,
): void {
  const origin = property(record, "origin");
  if (isRecord(origin) && property(origin, "id") === expected) return;
  fail(
    COMPOSITION_ERROR_CODES.mixedResearchMode,
    `${context} has another composition origin`,
  );
}

function fail(
  code: "MIXED_RESEARCH_MODE" | "UNSUPPORTED_RESEARCH_MODE",
  message: string,
): never {
  throw new ResearchCompositionError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function property(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

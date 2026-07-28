import { describe, expect, it } from "vitest";
import {
  COMPOSITION_ERROR_CODES,
  ResearchCompositionError,
} from "./compositionMode";
import { fixturePayload } from "./compositions/fixture";
import { validateCompositionPayload } from "./compositions/types";

const officialOrigin = {
  kind: "research-composition-origin" as const,
  mode: "official" as const,
  id: "stocksembly:official" as const,
};

function expectMixedMode(value: unknown): void {
  try {
    validateCompositionPayload(value);
    throw new Error("expected mixed-mode payload to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchCompositionError);
    if (!(error instanceof ResearchCompositionError)) return;
    expect(error.code).toBe(COMPOSITION_ERROR_CODES.mixedResearchMode);
  }
}

describe("composition origin attestation", () => {
  it("does not expose public origin or construction mint APIs", async () => {
    const publicCompositionMode = await import("./compositionMode");
    const publicMembership = await import("./compositionMode.membership");
    const publicCompositionTypes = await import("./compositions/types");
    expect(Object.keys(publicCompositionMode).sort()).toEqual([
      "COMPOSITION_ERROR_CODES",
      "RESEARCH_MODES",
      "ResearchCompositionError",
      "assertArtifactMode",
      "assertEventMode",
      "assertMode",
      "assertPayloadMode",
      "assertSnapshotMode",
    ]);
    expect(Object.keys(publicMembership).sort()).toEqual([
      "isTrustedCompositionOrigin",
      "isTrustedCompositionValue",
    ]);
    expect(Object.keys(publicCompositionTypes).sort()).toEqual([
      "validateCompositionPayload",
    ]);
  });

  it("rejects a complete fixture-to-official relabel without a minted attestation", () => {
    const relabeled = {
      ...fixturePayload,
      mode: "official" as const,
      origin: officialOrigin,
      snapshot: {
        ...fixturePayload.snapshot,
        mode: "official" as const,
        origin: officialOrigin,
      },
      codex: { kind: "real" as const, invocationCount: 1 },
      data: {
        ...fixturePayload.data,
        events: fixturePayload.data.events.map((event) => ({
          ...event,
          mode: "official" as const,
          origin: officialOrigin,
        })),
        playbackEvents: fixturePayload.data.playbackEvents.map((event) => ({
          ...event,
          mode: "official" as const,
          origin: officialOrigin,
        })),
        artifacts: fixturePayload.data.artifacts.map((artifact) => ({
          ...artifact,
          mode: "official" as const,
          origin: officialOrigin,
        })),
      },
    };

    expectMixedMode(relabeled);
  });

  it("loses composition origin membership through JSON and descriptor copies", () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(fixturePayload));
    expectMixedMode(roundTripped);

    const copied = Object.defineProperties(
      {},
      Object.getOwnPropertyDescriptors(fixturePayload),
    );
    expectMixedMode(copied);
  });
});

import { describe, expect, it } from "vitest";
import {
  COMPOSITION_ERROR_CODES,
  ResearchCompositionError,
} from "./compositionMode";
import { calibrationComposition } from "./compositions/calibration";
import {
  fixtureComposition,
  fixturePayload,
  fixtureSnapshot,
} from "./compositions/fixture";
import {
  createCompositionOrigin,
  createSnapshot,
  stampArtifact,
  stampEvent,
} from "./compositions/internal";
import {
  createOfficialComposition,
  officialComposition,
} from "./compositions/official";
import {
  type CompositionViewDataFor,
  validateCompositionPayload,
} from "./compositions/types";

describe("research composition mode boundaries", () => {
  it("exposes named fixture, official, and calibration compositions", () => {
    expect(fixtureComposition.name).toBe("fixture");
    expect(officialComposition.name).toBe("official");
    expect(calibrationComposition.name).toBe("calibration");
    expect(calibrationComposition.controls).toBe("office-only");
  });

  it("stamps every fixture event and artifact with fixture provenance", () => {
    expect(
      fixturePayload.data.events.every((event) => event.mode === "fixture"),
    ).toBe(true);
    expect(
      fixturePayload.data.artifacts.every(
        (artifact) => artifact.mode === "fixture",
      ),
    ).toBe(true);
  });

  it("invokes the fixture Codex port and records fake provenance", async () => {
    const payload = await fixtureComposition.createPayload();
    expect(payload.codex.kind).toBe("fake");
    expect(payload.codex.invocationCount).toBeGreaterThan(0);
  });

  it("rejects opening a fixture snapshot through official mode", () => {
    try {
      officialComposition.openSnapshot(fixtureSnapshot);
      throw new Error("expected mixed-mode open to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.mixedResearchMode);
    }
  });

  it("requires live adapters and a real Codex port for official mode", () => {
    const fakeDependencies = {
      evidenceAdapters: [],
      codex: {
        id: "fake",
        kind: "fake" as const,
        run: async () => ({ mode: "fixture" }),
      },
    };

    try {
      createOfficialComposition(fakeDependencies);
      throw new Error("expected official dependency check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.liveAdaptersRequired);
    }

    const liveDependencies = {
      evidenceAdapters: [
        {
          id: "sec-filings",
          kind: "live" as const,
          collect: async () => ({ source: "sec" }),
        },
      ],
      codex: fakeDependencies.codex,
    };

    try {
      createOfficialComposition(liveDependencies);
      throw new Error("expected fake Codex check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.realCodexRequired);
    }
  });

  it("owns official data before attestation and ignores later caller mutation", async () => {
    const mutableData = {
      ...fixturePayload.data,
      events: [],
      playbackEvents: [],
      artifacts: [],
    } as unknown as CompositionViewDataFor<"official"> & {
      events: unknown[];
      playbackEvents: unknown[];
      artifacts: unknown[];
    };
    const official = createOfficialComposition({
      evidenceAdapters: [
        {
          id: "live-sec-filings",
          kind: "live" as const,
          collect: async () => ({ source: "sec" }),
        },
      ],
      codex: {
        id: "real-codex",
        kind: "real" as const,
        run: async () => ({ accepted: true }),
      },
      buildData: async () => mutableData,
    });

    const payload = await official.createPayload();
    mutableData.events.push(...fixturePayload.data.events);
    mutableData.playbackEvents.push(...fixturePayload.data.playbackEvents);
    mutableData.artifacts.push(...fixturePayload.data.artifacts);

    expect(payload.data.events).toHaveLength(0);
    expect(payload.data.playbackEvents).toHaveLength(0);
    expect(payload.data.artifacts).toHaveLength(0);
    expect(
      [
        payload.data,
        payload.data.events,
        payload.snapshot,
        payload.snapshot.artifactIds,
        payload.codex,
      ].every((value) => Object.isFrozen(value)),
    ).toBe(true);
    expect(() =>
      (payload.snapshot.artifactIds as unknown as string[]).push("forged"),
    ).toThrow(TypeError);
    expect(
      () => ((payload.codex as unknown as { kind: string }).kind = "fake"),
    ).toThrow(TypeError);
    expect([payload.snapshot.artifactIds.length, payload.codex.kind]).toEqual([
      0,
      "real",
    ]);
    expect(() => validateCompositionPayload(payload)).not.toThrow();
  });

  it("rejects mismatched payload mode and fixture events as official", () => {
    try {
      validateCompositionPayload({
        ...fixturePayload,
        mode: "official",
        codex: { kind: "real", invocationCount: 1 },
      });
      throw new Error("expected mixed payload to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.mixedResearchMode);
    }
  });

  it("rejects fixture events when an official snapshot is supplied", () => {
    const officialOrigin = createCompositionOrigin("official");
    try {
      validateCompositionPayload({
        ...fixturePayload,
        mode: "official",
        snapshot: createSnapshot(
          "official-snapshot-v1",
          officialOrigin,
          fixturePayload.data.artifacts.map((artifact) => artifact.id),
        ),
        codex: { kind: "real", invocationCount: 1 },
      });
      throw new Error("expected fixture event provenance to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.mixedResearchMode);
    }
  });

  it("rejects label-only event and artifact relabeling", () => {
    const fixtureEvent = fixturePayload.data.events.at(0);
    const fixtureArtifact = fixturePayload.data.artifacts.at(0);
    const officialOrigin = createCompositionOrigin("official");
    if (!fixtureEvent || !fixtureArtifact) {
      throw new Error("fixture provenance test data is empty");
    }
    expect(() => stampEvent(fixtureEvent, officialOrigin)).toThrowError(
      ResearchCompositionError,
    );
    expect(() => stampArtifact(fixtureArtifact, officialOrigin)).toThrowError(
      ResearchCompositionError,
    );
  });

  it("rejects a fixture event relabeled official while retaining fixture origin", () => {
    const fixtureEvent = fixturePayload.data.events.at(0);
    if (!fixtureEvent) throw new Error("fixture event test data is empty");
    const officialOrigin = createCompositionOrigin("official");
    const officialSnapshot = createSnapshot(
      "official-snapshot-v1",
      officialOrigin,
      fixturePayload.data.artifacts.map((artifact) => artifact.id),
    );
    expect(() =>
      validateCompositionPayload({
        ...fixturePayload,
        mode: "official",
        origin: {
          kind: "research-composition-origin",
          mode: "official",
          id: "stocksembly:official",
        },
        snapshot: officialSnapshot,
        codex: { kind: "real", invocationCount: 1 },
        data: {
          ...fixturePayload.data,
          events: [{ ...fixtureEvent, mode: "official" }],
          playbackEvents: [{ ...fixtureEvent, mode: "official" }],
        },
      }),
    ).toThrowError(ResearchCompositionError);
    try {
      validateCompositionPayload({
        ...fixturePayload,
        mode: "official",
        origin: {
          kind: "research-composition-origin",
          mode: "official",
          id: "stocksembly:official",
        },
        snapshot: officialSnapshot,
        codex: { kind: "real", invocationCount: 1 },
        data: {
          ...fixturePayload.data,
          events: [{ ...fixtureEvent, mode: "official" }],
          playbackEvents: [{ ...fixtureEvent, mode: "official" }],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchCompositionError);
      if (!(error instanceof ResearchCompositionError)) return;
      expect(error.code).toBe(COMPOSITION_ERROR_CODES.mixedResearchMode);
    }
  });
});

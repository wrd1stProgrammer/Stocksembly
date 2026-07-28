import {
  assertSnapshotMode,
  COMPOSITION_ERROR_CODES,
  ResearchCompositionError,
  type ResearchSnapshot,
} from "../compositionMode";
import {
  createCompositionOrigin,
  createCompositionPayload,
  createSnapshot,
} from "./internal";
import type {
  CompositionDataFor,
  OfficialDependencies,
  ResearchComposition,
  ResearchCompositionPayloadFor,
} from "./types";

export type OfficialComposition = ResearchComposition<"official">;

const officialOrigin = createCompositionOrigin("official");

function unavailableCompany(
  symbol: string,
  company: string,
  exchange: string,
  sector: string,
): ReturnType<CompositionDataFor<"official">["createCompany"]> {
  void symbol;
  void company;
  void exchange;
  void sector;
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.liveAdaptersRequired,
    "official company data is unavailable until live adapters are ready",
  );
}

async function unavailablePayload(): Promise<
  ResearchCompositionPayloadFor<"official">
> {
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.liveAdaptersRequired,
    "official research data is available only after live adapters and Codex are ready",
  );
}

export const officialComposition: OfficialComposition = {
  name: "official",
  mode: "official",
  createCompany: unavailableCompany,
  createPayload: unavailablePayload,
  openSnapshot(snapshot: ResearchSnapshot) {
    return assertSnapshotMode("official", snapshot);
  },
};

function validateOfficialDependencies(
  dependencies: OfficialDependencies,
): void {
  if (
    dependencies.evidenceAdapters.length === 0 ||
    dependencies.evidenceAdapters.some((adapter) => adapter.kind !== "live")
  ) {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.liveAdaptersRequired,
      "official composition requires at least one live evidence adapter",
    );
  }
  if (dependencies.codex.kind !== "real") {
    throw new ResearchCompositionError(
      COMPOSITION_ERROR_CODES.realCodexRequired,
      "official composition requires the real Codex adapter",
    );
  }
}

export function createOfficialComposition(
  dependencies: OfficialDependencies,
): OfficialComposition {
  validateOfficialDependencies(dependencies);
  return {
    ...officialComposition,
    async createPayload() {
      const evidence = await Promise.all(
        dependencies.evidenceAdapters.map((adapter) => adapter.collect("NVDA")),
      );
      const codex = await dependencies.codex.run({ evidence });
      if (!dependencies.buildData) {
        throw new ResearchCompositionError(
          COMPOSITION_ERROR_CODES.liveAdaptersRequired,
          "official composition has no live data builder",
        );
      }
      const data = await dependencies.buildData({ evidence, codex });
      const snapshot = createSnapshot(
        "official-snapshot-v1",
        officialOrigin,
        data.artifacts.map((artifact) => artifact.id),
      );
      return createCompositionPayload(officialOrigin, data, snapshot, {
        kind: "real",
        invocationCount: 1,
      });
    },
  };
}

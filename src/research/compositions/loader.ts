import {
  COMPOSITION_ERROR_CODES,
  RESEARCH_MODES,
  ResearchCompositionError,
  type ResearchMode,
} from "../compositionMode";
import { officialComposition } from "./official";
import type { ResearchComposition } from "./types";

export function researchModeFromEnvironment(
  value: string | undefined,
): ResearchMode {
  switch (value) {
    case RESEARCH_MODES.fixture:
      return RESEARCH_MODES.fixture;
    case RESEARCH_MODES.calibration:
      return RESEARCH_MODES.calibration;
    case RESEARCH_MODES.official:
    case undefined:
      return RESEARCH_MODES.official;
    default:
      throw new ResearchCompositionError(
        COMPOSITION_ERROR_CODES.unsupportedMode,
        `unsupported research mode: ${value}`,
      );
  }
}

export async function loadResearchComposition(
  mode: ResearchMode,
): Promise<ResearchComposition> {
  switch (mode) {
    case RESEARCH_MODES.official:
      return officialComposition;
    case RESEARCH_MODES.fixture:
      throw new ResearchCompositionError(
        COMPOSITION_ERROR_CODES.unsupportedMode,
        "fixture composition is served by the fixture-only route",
      );
    case RESEARCH_MODES.calibration:
      throw new ResearchCompositionError(
        COMPOSITION_ERROR_CODES.unsupportedMode,
        "calibration is only available through the showcase route",
      );
    default:
      return assertNever(mode);
  }
}

function assertNever(value: never): never {
  throw new ResearchCompositionError(
    COMPOSITION_ERROR_CODES.unsupportedMode,
    `unsupported research mode: ${String(value)}`,
  );
}

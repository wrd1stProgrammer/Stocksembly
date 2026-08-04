import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ResearchDecisionPathBoard,
  ResearchEvidenceBalance,
  ResearchMetricStrip,
  ResearchSegmentMix,
} from "./ResearchFileVisuals";

describe("ResearchFileVisuals empty states", () => {
  it("omits empty chart frames", () => {
    const { container } = render(
      <>
        <ResearchMetricStrip metrics={[]} locale="en" />
        <ResearchDecisionPathBoard paths={[]} locale="en" />
        <ResearchSegmentMix metrics={[]} locale="en" />
        <ResearchEvidenceBalance
          locale="en"
          balance={{
            total: 0,
            supported: 0,
            partial: 0,
            challenged: 0,
            unverified: 0,
            segments: [],
          }}
        />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, expect, it } from "vitest";
import { ResearchReportSchema } from "./domain/report";
import { validReport } from "./domain/report.testSupport";
import {
  activityCopy,
  compactNarrative,
  evidenceScore,
  narrativeLayers,
  qualitativePosture,
  speechBubbleSegments,
} from "./researchPresentation";

describe("research presentation", () => {
  it("deduplicates and bounds long narrative copy", () => {
    const sentence = "Revenue growth remained strong.";
    const value = `${sentence} ${sentence} Margins improved. A fourth sentence is omitted.`;
    expect(compactNarrative(value, { sentences: 2 })).toBe(
      "Revenue growth remained strong. Margins improved.",
    );
  });

  it("creates a short public activity without persistence diagnostics", () => {
    const copy = activityCopy(
      "The filing supports a durable product advantage. The next release should test adoption. A third sentence should not appear.",
      "en",
    );
    expect(copy.headline.length).toBeLessThanOrEqual(92);
    expect(`${copy.headline} ${copy.body}`).not.toContain("third sentence");
    expect(`${copy.headline} ${copy.body}`).not.toContain("Committed event");
  });

  it("separates a scan-friendly summary from the supporting detail", () => {
    // Given
    const value =
      "Revenue accelerated in the latest filing. Gross margin also expanded year over year. Customer concentration remains the main counterweight.";

    // When
    const layers = narrativeLayers(value);

    // Then
    expect(layers.summary).toBe("Revenue accelerated in the latest filing.");
    expect(layers.detail).toBe(
      "Gross margin also expanded year over year. Customer concentration remains the main counterweight.",
    );
  });

  it("splits long live speech into readable actor-sized segments", () => {
    // Given
    const value =
      "위험조정 투자 매력은 조건부 긍정입니다. 매출과 영업이익은 강하지만 고객 집중과 공급 제약을 함께 점검해야 합니다. 현재 가격에서는 장기 성장률과 마진 유지 여부가 판단을 바꿉니다.";

    // When
    const segments = speechBubbleSegments(value, "ko");

    // Then
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.length <= 58)).toBe(true);
    expect(segments.join(" ")).not.toContain("...");
  });

  it("derives a qualitative posture and real audit denominator", () => {
    const report = ResearchReportSchema.parse(validReport());
    expect(qualitativePosture(report)).toBe("neutral");
    expect(evidenceScore(report)).toEqual({ passed: 2, denominator: 2 });
  });
});

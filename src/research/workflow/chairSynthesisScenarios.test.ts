import { describe, expect, it } from "vitest";
import {
  chairScenarioSentences,
  recoverChairScenarioSentences,
} from "./chairSynthesisScenarios";

describe("chairScenarioSentences", () => {
  it("renders large revenue scenarios as readable magnitudes", () => {
    expect(
      chairScenarioSentences([{ field: "revenue", value: "331839000000" }]),
    ).toEqual([
      {
        id: "scenario:1:revenue",
        text: { en: "Revenue: $331.8B", ko: "매출: US$3318.4억" },
      },
    ]);
  });

  it("preserves small scenario values used by existing reports", () => {
    expect(
      chairScenarioSentences([{ field: "revenue", value: "100" }]),
    ).toEqual([
      {
        id: "scenario:1:revenue",
        text: { en: "Revenue: 100", ko: "매출: 100" },
      },
    ]);
  });

  it("rounds percentage scenarios for public display", () => {
    expect(
      chairScenarioSentences([
        { field: "operating_margin", value: "-1.80445354491938" },
      ]),
    ).toEqual([
      {
        id: "scenario:1:operating_margin",
        text: {
          en: "Operating margin: -1.8%",
          ko: "영업이익률: -1.8%",
        },
      },
    ]);
  });

  it("repairs one reversed scenario once, omits one malformed scenario, and keeps two valid scenarios", () => {
    const recovered = recoverChairScenarioSentences([
      { field: "100", value: "revenue" },
      { field: "not-a-field", value: "not-a-value" },
      { field: "operating_margin", value: "12" },
    ]);

    expect(recovered.sentences.map((sentence) => sentence.id)).toEqual([
      "scenario:1:revenue",
      "scenario:3:operating_margin",
    ]);
    expect(recovered.repairAttempts).toEqual([
      { itemId: "scenario:1", attempts: 1 },
      { itemId: "scenario:2", attempts: 1 },
    ]);
    expect(recovered.omissions).toEqual([
      { itemId: "scenario:2", reason: "scenario_invalid_after_repair" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { publicTextIsValid } from "./chairSynthesisTextValidation";

describe("chair synthesis public text", () => {
  const sources = [
    {
      text: {
        en: "FY2026 operating margin reached 46.8 alongside revenue growth.",
        ko: "FY2026 영업이익률은 46.8에 도달했다.",
      },
    },
  ];

  it("does not treat sentence punctuation as part of a grounded number", () => {
    expect(
      publicTextIsValid(
        {
          en: "The operating margin reached 46.8.",
          ko: "영업이익률은 46.8에 도달했다.",
        },
        sources,
        360,
      ),
    ).toBe(true);
  });

  it("still rejects a genuinely unsupported number", () => {
    expect(
      publicTextIsValid(
        {
          en: "The operating margin reached 99.9.",
          ko: "영업이익률은 99.9에 도달했다.",
        },
        sources,
        360,
      ),
    ).toBe(false);
  });

  it("accepts equivalent financial-unit formatting", () => {
    expect(
      publicTextIsValid(
        {
          en: "Revenue reached $107.7B, supporting the earnings case.",
          ko: "매출은 1,077억달러로 실적 논지를 뒷받침한다.",
        },
        [
          {
            text: {
              en: "Revenue reached 107.7 billion dollars and supports the earnings case.",
              ko: "매출은 1,077억 달러이며 실적 논지를 뒷받침한다.",
            },
          },
        ],
        360,
      ),
    ).toBe(true);
  });
});

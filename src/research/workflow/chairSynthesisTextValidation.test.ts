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

  it("accepts a grounded number rounded to lower precision", () => {
    expect(
      publicTextIsValid(
        {
          en: "EV/revenue is about 24.3x versus the peer median.",
          ko: "EV/매출은 peer 중앙값 대비 약 24.3배입니다.",
        },
        [
          {
            text: {
              en: "EV/revenue is 24.28x versus the peer median.",
              ko: "EV/매출은 peer 중앙값 대비 24.28배입니다.",
            },
          },
        ],
        360,
      ),
    ).toBe(true);
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

  it("accepts an exact English mirror when English was requested", () => {
    expect(
      publicTextIsValid(
        {
          en: "FY2026 operating margin reached 46.8 alongside revenue growth.",
          ko: "FY2026 operating margin reached 46.8 alongside revenue growth.",
        },
        sources,
        360,
        "en",
      ),
    ).toBe(true);
  });

  it("does not reject a grounded direct trade conclusion", () => {
    expect(
      publicTextIsValid(
        {
          en: "Buy now because the operating margin reached 46.8.",
          ko: "영업이익률이 46.8에 도달했으므로 지금 매수합니다.",
        },
        sources,
        360,
      ),
    ).toBe(true);
  });

  it("rejects a Korean mirror when English was requested", () => {
    expect(
      publicTextIsValid(
        {
          en: "FY2026 영업이익률은 46.8에 도달했다.",
          ko: "FY2026 영업이익률은 46.8에 도달했다.",
        },
        sources,
        360,
        "en",
      ),
    ).toBe(false);
  });
});

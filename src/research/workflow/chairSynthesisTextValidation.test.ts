import { describe, expect, it } from "vitest";
import { resolveEditorialItemDefect } from "../domain/editorialStance";
import {
  normalizeReaderFacingPrecision,
  publicTextIsValid,
} from "./chairSynthesisTextValidation";

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

  it("rejects raw provider precision from reader-facing prose", () => {
    expect(
      publicTextIsValid(
        {
          en: "Revenue growth is 17.896220057587453%.",
          ko: "매출 성장률은 17.896220057587453%입니다.",
        },
        [
          {
            text: {
              en: "Revenue growth is 17.896220057587453%.",
              ko: "매출 성장률은 17.896220057587453%입니다.",
            },
          },
        ],
        360,
      ),
    ).toBe(false);
  });

  it("normalizes provider precision without changing financial notation", () => {
    expect(
      normalizeReaderFacingPrecision(
        "EPS was 4.7146, revenue was $1,234.5678 and growth was -17.8962%.",
      ),
    ).toBe("EPS was 4.71, revenue was $1,234.57 and growth was -17.9%.");
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

  it.each([
    ["bUy NoW because the operating margin reached 46.8.", "upside"],
    ["SeLl NoW because the operating margin reached 46.8.", "downside"],
    ["영업이익률이 46.8에 도달했으므로 지금 매수합니다.", "upside"],
    ["영업이익률이 46.8에 도달했으므로 즉시 매도합니다.", "downside"],
  ] as const)(
    "requests one evidence-language rewrite for %s",
    (text, direction) => {
      expect(
        resolveEditorialItemDefect({ text, direction, repairAttempt: 0 }),
      ).toEqual(
        expect.objectContaining({ kind: "rewrite_required", attempt: 1 }),
      );
      expect(
        resolveEditorialItemDefect({ text, direction, repairAttempt: 1 }),
      ).toEqual(
        expect.objectContaining({
          kind: "omitted",
          reportDisposition: "complete_with_limitations",
        }),
      );
    },
  );

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

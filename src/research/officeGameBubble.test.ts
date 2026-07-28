import { describe, expect, it } from "vitest";
import { bubbleDimensions } from "./officeGameBubble";
import { bubbleStateFor } from "./officeGameBubbleState";

describe("office progress bubbles", () => {
  it("fits the bubble surface to its message instead of reserving a fixed box", () => {
    // Given / When
    const short = bubbleDimensions("점검 중");
    const long = bubbleDimensions(
      "장문의 리서치 근거를 읽기 쉬운 두세 줄로 나누어 말풍선 안에 표시합니다",
    );

    // Then
    expect(short.width).toBeLessThan(long.width);
    expect(short.height).toBeLessThanOrEqual(long.height);
    expect(long.width).toBeLessThanOrEqual(212);
    expect(long.height).toBeLessThanOrEqual(82);
  });

  it("rotates public research updates across the five specialists", () => {
    const active = [
      "market",
      "company",
      "financial",
      "valuation",
      "risk",
    ] as const;
    expect(bubbleStateFor("market", "collecting", active, 200, "ko")).toEqual({
      visible: true,
      message: "금리·물가 확인 중",
    });
    expect(bubbleStateFor("company", "collecting", active, 2600, "en")).toEqual(
      {
        visible: true,
        message: "Mapping competitors",
      },
    );
  });

  it("shows only the active committee speaker", () => {
    expect(bubbleStateFor("risk", "committee", ["risk"], 0, "ko")).toEqual({
      visible: true,
      message: "하방 시나리오 반론 중",
    });
    expect(bubbleStateFor("company", "committee", ["risk"], 0, "ko")).toEqual({
      visible: false,
      message: "",
    });
  });

  it("rotates one speaker when the full standing committee is active", () => {
    const active = ["market", "company", "financial"] as const;
    expect(bubbleStateFor("market", "committee", active, 0, "en").visible).toBe(
      true,
    );
    expect(
      bubbleStateFor("company", "committee", active, 0, "en").visible,
    ).toBe(false);
    expect(
      bubbleStateFor("company", "committee", active, 3900, "en").visible,
    ).toBe(true);
  });
});

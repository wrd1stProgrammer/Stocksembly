import { describe, expect, it } from "vitest";
import { bubbleDimensions, typewriterCharacterCount } from "./officeGameBubble";
import { bubbleStateFor, isActorReadyForSpeech } from "./officeGameBubbleState";

describe("office progress bubbles", () => {
  it("fits the bubble surface to its message instead of reserving a fixed box", () => {
    // Given / When
    const short = bubbleDimensions("점검 중");
    const long = bubbleDimensions(
      "장문의 리서치 근거를 읽기 쉬운 두세 줄로 나누어 말풍선 안에 표시합니다",
    );
    const fourLine = bubbleDimensions(
      "NVIDIA's reported economics support premium valuation while revenue, operating margin, and cash conversion still require separate evidence checks.",
    );

    // Then
    expect(short.width).toBeLessThan(long.width);
    expect(short.height).toBeLessThanOrEqual(long.height);
    expect(long.width).toBeLessThanOrEqual(212);
    expect(long.height).toBeLessThanOrEqual(100);
    expect(fourLine.height).toBeGreaterThanOrEqual(86);
    expect(fourLine.height).toBeLessThanOrEqual(100);
  });

  it("types characters quickly and disables the animation for reduced motion", () => {
    expect(typewriterCharacterCount(0)).toBe(0);
    expect(typewriterCharacterCount(11)).toBe(0);
    expect(typewriterCharacterCount(12)).toBe(1);
    expect(typewriterCharacterCount(120)).toBe(10);
    expect(typewriterCharacterCount(0, true)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("waits until an actor has arrived and finished orienting before speech", () => {
    const destination = { x: 4, y: 5 };
    const ready = {
      action: "talk" as const,
      cell: destination,
      destination,
      motion: null,
    };

    expect(isActorReadyForSpeech(ready)).toBe(true);
    expect(isActorReadyForSpeech({ ...ready, action: "orient" })).toBe(false);
    expect(
      isActorReadyForSpeech({
        ...ready,
        cell: { x: 3, y: 5 },
        motion: {
          from: { x: 3, y: 5 },
          to: destination,
          elapsedTicks: 1,
          durationTicks: 2,
        },
      }),
    ).toBe(false);
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

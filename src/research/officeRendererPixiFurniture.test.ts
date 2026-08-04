import { describe, expect, it } from "vitest";
import {
  chairLayerOrderForFacing,
  chairRootOffsetYForFacing,
  chairVisualForFacing,
  laptopVisualForFacing,
} from "./officeRendererPixiFurniture";

describe("office chair rendering", () => {
  it("places the backrest away from the tabletop for top and bottom seats", () => {
    const lookingUp = chairVisualForFacing("up");
    const lookingDown = chairVisualForFacing("down");

    expect(lookingUp.backrestY).toBeGreaterThan(lookingUp.cushionY);
    expect(lookingDown.backrestY).toBeLessThan(lookingDown.cushionY);
  });

  it("uses mirrored top-down laptop geometry instead of rotating one perspective", () => {
    // Given
    const lookingUp = laptopVisualForFacing("up");
    const lookingDown = laptopVisualForFacing("down");
    // When
    const upKeyboardNearActor = lookingUp.keyboardY > lookingUp.screenY;
    const downKeyboardNearActor = lookingDown.keyboardY < lookingDown.screenY;
    // Then
    expect(upKeyboardNearActor).toBe(true);
    expect(downKeyboardNearActor).toBe(true);
    expect(lookingDown.rootOffsetY).toBeGreaterThan(lookingUp.rootOffsetY);
    expect(lookingDown.rotation).toBe(0);
  });

  it("places only the lower up-facing backrest in front of a seated actor", () => {
    // Given
    const lookingUp = chairLayerOrderForFacing("up");
    const lookingDown = chairLayerOrderForFacing("down");
    // When / Then
    expect(lookingUp.front).toBeGreaterThan(lookingUp.actor);
    expect(lookingUp.rear).toBeLessThan(lookingUp.actor);
    expect(lookingDown.front).toBeLessThan(lookingDown.actor);
    expect(lookingDown.rear).toBeLessThan(lookingDown.actor);
  });

  it("keeps the top chair cushion under the seated actor instead of the table", () => {
    const belowTable = chairRootOffsetYForFacing("up");
    const aboveTable = chairRootOffsetYForFacing("down");

    expect(aboveTable).toBeLessThan(belowTable);
    expect(aboveTable).toBe(-20);
  });
});

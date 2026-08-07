import { describe, expect, it } from "vitest";
import {
  chairAssetPathForFacing,
  chairLayerOrderForFacing,
  chairRootOffsetYForFacing,
  chairVisualForFacing,
  laptopVisualForFacing,
} from "./officeRendererPixiFurniture";

describe("office chair rendering", () => {
  it("loads a direction-specific chair instead of reusing the front view", () => {
    expect(chairAssetPathForFacing("up")).toMatch(/analyst-chair-up\.png$/u);
    expect(chairAssetPathForFacing("down")).toMatch(
      /analyst-chair-down\.png$/u,
    );
  });

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

  it("puts the real chair back in front only for an away-facing analyst", () => {
    // Given
    const lookingUp = chairLayerOrderForFacing("up");
    const lookingDown = chairLayerOrderForFacing("down");
    // When / Then
    expect(lookingUp.chair).toBeGreaterThan(lookingUp.actor);
    expect(lookingDown.chair).toBeLessThan(lookingDown.actor);
  });

  it("keeps the top chair cushion under the seated actor instead of the table", () => {
    const belowTable = chairRootOffsetYForFacing("up");
    const aboveTable = chairRootOffsetYForFacing("down");

    expect(aboveTable).toBeLessThan(belowTable);
    expect(aboveTable).toBe(-16);
  });
});

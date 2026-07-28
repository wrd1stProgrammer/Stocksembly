import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { ACTOR_ATLAS } from "./officeActorAtlas";
import { agentAnimations } from "./officeGameAnimations";
import { LEGACY_AGENT_IDS } from "./officeSceneManifest";

const publicRoot = path.join(process.cwd(), "public/research/office-v6");

function png(relativePath: string): PNG {
  return PNG.sync.read(fs.readFileSync(path.join(publicRoot, relativePath)));
}

function alphaAt(image: PNG, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? 0;
}

function luminanceAt(image: PNG, x: number, y: number): number {
  const index = (y * image.width + x) * 4;
  const red = image.data[index] ?? 0;
  const green = image.data[index + 1] ?? 0;
  const blue = image.data[index + 2] ?? 0;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function frameEdgeAlpha(image: PNG, column: number, row: number): number[] {
  const left = column * ACTOR_ATLAS.frame.width;
  const top = row * ACTOR_ATLAS.frame.height;
  const right = left + ACTOR_ATLAS.frame.width - 1;
  const bottom = top + ACTOR_ATLAS.frame.height - 1;
  const values: number[] = [];
  for (let x = left; x <= right; x += 1) {
    values.push(alphaAt(image, x, top), alphaAt(image, x, bottom));
  }
  for (let y = top; y <= bottom; y += 1) {
    values.push(alphaAt(image, left, y), alphaAt(image, right, y));
  }
  return values;
}

function outerEdgeAlpha(image: PNG): number[] {
  const values: number[] = [];
  for (let x = 0; x < image.width; x += 1) {
    values.push(alphaAt(image, x, 0), alphaAt(image, x, image.height - 1));
  }
  for (let y = 0; y < image.height; y += 1) {
    values.push(alphaAt(image, 0, y), alphaAt(image, image.width - 1, y));
  }
  return values;
}

function frameAlphaBounds(image: PNG, column: number, row: number) {
  const originX = column * ACTOR_ATLAS.frame.width;
  const originY = row * ACTOR_ATLAS.frame.height;
  let top: number = ACTOR_ATLAS.frame.height;
  let bottom = -1;
  for (let y = 0; y < ACTOR_ATLAS.frame.height; y += 1) {
    for (let x = 0; x < ACTOR_ATLAS.frame.width; x += 1) {
      if (alphaAt(image, originX + x, originY + y) === 0) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { height: bottom - top + 1, bottom };
}

describe("office v6 raster assets", () => {
  it("keeps every actor frame clear of all four cell edges", () => {
    for (const agentId of LEGACY_AGENT_IDS) {
      const atlas = png(`agents/${agentId}.png`);
      expect(atlas.width).toBe(640);
      expect(atlas.height).toBe(768);
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          expect(Math.max(...frameEdgeAlpha(atlas, column, row))).toBe(0);
        }
      }
    }
  });

  it("keeps every used pose inside its cell and on one foot baseline", () => {
    const usedFrames = [
      ...new Map(
        Object.values(agentAnimations)
          .flat()
          .map((frame) => [`${frame.column}:${frame.row}`, frame]),
      ).values(),
    ];
    for (const agentId of LEGACY_AGENT_IDS) {
      const atlas = png(`agents/${agentId}.png`);
      for (const frame of usedFrames) {
        const bounds = frameAlphaBounds(atlas, frame.column, frame.row);
        expect(bounds.height).toBeGreaterThanOrEqual(82);
        expect(bounds.height).toBeLessThanOrEqual(154);
        expect(bounds.bottom).toBe(ACTOR_ATLAS.footPivot.y - 1);
      }
    }
  });

  it("keeps every simple work chair clear of its file edge", () => {
    for (const direction of ["down", "left", "right", "up"] as const) {
      const chair = png(`furniture/chair-${direction}.png`);
      expect(Math.max(...outerEdgeAlpha(chair))).toBe(0);
    }
  });

  it("keeps the chairless base at the scene's native dimensions", () => {
    const base = png("base.png");
    expect({ width: base.width, height: base.height }).toEqual({
      width: 1448,
      height: 1086,
    });
  });

  it("fills all four base corners with dark office artwork", () => {
    const base = png("base.png");
    const corners = [
      [0, 0],
      [base.width - 1, 0],
      [0, base.height - 1],
      [base.width - 1, base.height - 1],
    ] as const;
    for (const [x, y] of corners) {
      expect(alphaAt(base, x, y)).toBe(255);
      expect(luminanceAt(base, x, y)).toBeLessThan(90);
    }
  });
});

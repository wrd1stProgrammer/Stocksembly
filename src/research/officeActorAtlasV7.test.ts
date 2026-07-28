import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

const publicRoot = path.join(process.cwd(), "public/research/office-v7");
const frame = { width: 160, height: 192 };
const columns = 4;
const rows = 4;

type AlphaBounds = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

function readPng(relativePath: string): PNG {
  return PNG.sync.read(fs.readFileSync(path.join(publicRoot, relativePath)));
}

function alphaAt(image: PNG, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? 0;
}

function frameBounds(image: PNG, column: number, row: number): AlphaBounds {
  const originX = column * frame.width;
  const originY = row * frame.height;
  let left = frame.width;
  let right = -1;
  let top = frame.height;
  let bottom = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (alphaAt(image, originX + x, originY + y) < 8) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
}

function atlasBounds(image: PNG): readonly AlphaBounds[] {
  const bounds: AlphaBounds[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      bounds.push(frameBounds(image, column, row));
    }
  }
  return bounds;
}

function framePixels(image: PNG, column: number, row: number): Buffer {
  const pixels = Buffer.alloc(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y += 1) {
    const sourceStart =
      ((row * frame.height + y) * image.width + column * frame.width) * 4;
    const targetStart = y * frame.width * 4;
    image.data.copy(
      pixels,
      targetStart,
      sourceStart,
      sourceStart + frame.width * 4,
    );
  }
  return pixels;
}

function imageBounds(image: PNG): AlphaBounds {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) < 8) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
}

describe("office v7 directional actor atlases", () => {
  it("builds one exact 640x768 atlas for every manifest actor", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      // Given
      const atlas = readPng(`agents/${member.id}.png`);

      // When
      const dimensions = { width: atlas.width, height: atlas.height };

      // Then
      expect(dimensions).toEqual({ width: 640, height: 768 });
    }
  });

  it("keeps every frame populated with sixteen-pixel top and side safety", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      // Given
      const atlas = readPng(`agents/${member.id}.png`);

      // When
      const bounds = atlasBounds(atlas);

      // Then
      expect(bounds).toHaveLength(16);
      for (const [index, pose] of bounds.entries()) {
        expect(pose.left).toBeGreaterThanOrEqual(16);
        expect(pose.right).toBeLessThanOrEqual(frame.width - 17);
        expect(pose.top).toBeGreaterThanOrEqual(16);
        if (index % columns === 3) {
          const row = Math.floor(index / columns);
          if (row === 0) {
            expect(pose.bottom).toBeGreaterThanOrEqual(174);
            expect(pose.bottom).toBeLessThanOrEqual(178);
          } else {
            expect(pose.bottom).toBeGreaterThanOrEqual(150);
            expect(pose.bottom).toBeLessThanOrEqual(158);
          }
        } else {
          expect(pose.bottom).toBeGreaterThanOrEqual(174);
          expect(pose.bottom).toBeLessThanOrEqual(178);
        }
      }
    }
  });

  it("normalizes all standing poses to one scale and foot baseline", () => {
    // Given
    const standingByActor = OFFICE_SCENE_MANIFEST.roster.map((member) => {
      const bounds = atlasBounds(readPng(`agents/${member.id}.png`));
      return bounds.filter((_, index) => index % columns < 3);
    });

    // When
    const standingBounds = standingByActor.flat();
    const heights = standingBounds.map((pose) => pose.bottom - pose.top + 1);
    const baselines = standingBounds.map((pose) => pose.bottom);
    const medianHeights = standingByActor.map((poses) => {
      const actorHeights = poses
        .map((pose) => pose.bottom - pose.top + 1)
        .sort((left, right) => left - right);
      return actorHeights[Math.floor(actorHeights.length / 2)] ?? 0;
    });

    // Then
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(134);
    expect(Math.max(...heights)).toBeLessThanOrEqual(160);
    expect(
      Math.max(...medianHeights) - Math.min(...medianHeights),
    ).toBeLessThanOrEqual(2);
    expect(Math.min(...baselines)).toBeGreaterThanOrEqual(174);
    expect(Math.max(...baselines)).toBeLessThanOrEqual(178);
  });

  it("preserves each direction's dedicated seated pose", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      // Given
      const atlas = readPng(`agents/${member.id}.png`);

      for (let row = 0; row < rows; row += 1) {
        // When
        const idle = framePixels(atlas, 0, row);
        const seated = framePixels(atlas, 3, row);

        // Then
        expect(seated).not.toEqual(idle);
      }
    }
  });

  it("keeps every portrait transparent, padded, and inside a square crop", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      // Given
      const portrait = readPng(`portraits/${member.id}.png`);

      // When
      const bounds = imageBounds(portrait);

      // Then
      expect({ width: portrait.width, height: portrait.height }).toEqual({
        width: 192,
        height: 192,
      });
      expect(bounds.left).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(183);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.bottom).toBeLessThanOrEqual(183);
    }
  });
});
